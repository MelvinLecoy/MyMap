import { readFileSync, writeFileSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import { collectionRows, seedSql } from "./supabase-data.js";

type Setup = {
  projectRef: string;
  ownerEmail: string;
  siteUrl: string;
  vercelProject: string;
};
async function main() {
  const path = process.argv[2] ?? ".cache/cloud-setup.json";
  const config = JSON.parse(readFileSync(path, "utf8")) as Setup;
  if (
    !/^[a-z0-9]{20}$/.test(config.projectRef) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.ownerEmail)
  )
    throw new Error(
      "Invalid project reference or editor email in the private setup configuration.",
    );
  const site = new URL(config.siteUrl);
  if (site.protocol !== "https:" || site.pathname !== "/")
    throw new Error("Expected the production site root URL.");
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const vercelToken = process.env.VERCEL_TOKEN;
  if (!token || !vercelToken)
    throw new Error(
      "Configure SUPABASE_ACCESS_TOKEN and VERCEL_TOKEN in the cloud environment's secrets, then apply the settings.",
    );
  const base = `https://api.supabase.com/v1/projects/${config.projectRef}`;
  const projectUrl = `https://${config.projectRef}.supabase.co`;
  const call = async (
    url: string,
    authorization: string,
    method = "GET",
    body?: unknown,
    apiKey?: string,
  ) => {
    const response = await fetch(url, {
      method,
      signal: AbortSignal.timeout(30000),
      headers: {
        Authorization: `Bearer ${authorization}`,
        "Content-Type": "application/json",
        ...(apiKey ? { apikey: apiKey } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok)
      throw new Error(
        `${new URL(url).hostname} ${method} request failed (HTTP ${response.status}). No credential values were logged.`,
      );
    return response.status === 204 ? null : response.json();
  };
  const query = (sql: string) =>
    call(`${base}/database/query`, token, "POST", { query: sql });
  const project = await call(base, token);
  if (project.id !== config.projectRef || project.status !== "ACTIVE_HEALTHY")
    throw new Error(
      "The selected Supabase project is not ready; no changes were applied.",
    );
  // Verify access to the actual Vercel project before changing either service.
  let vercelProject;
  try {
    vercelProject = await call(
      `https://api.vercel.com/v9/projects/${encodeURIComponent(config.vercelProject)}`,
      vercelToken,
    );
  } catch {
    const teams = await call(
      "https://api.vercel.com/v2/teams?limit=100",
      vercelToken,
    );
    for (const team of teams.teams ?? []) {
      try {
        const candidate = await call(
          `https://api.vercel.com/v9/projects/${encodeURIComponent(config.vercelProject)}?teamId=${encodeURIComponent(team.id)}`,
          vercelToken,
        );
        if (candidate.name === config.vercelProject) {
          vercelProject = candidate;
          break;
        }
      } catch {
        /* The token may be scoped to only one of its teams. */
      }
    }
  }
  if (!vercelProject?.id || vercelProject.name !== config.vercelProject)
    throw new Error("The Vercel project could not be verified.");
  const vercelTeam = vercelProject.accountId?.startsWith("team_")
    ? `?teamId=${encodeURIComponent(vercelProject.accountId)}`
    : "";
  console.log("Verified the requested Supabase and Vercel projects.");

  await query(
    readFileSync(resolve("supabase/migrations/202611120001_atlas.sql"), "utf8"),
  );
  const rows = collectionRows();
  for (let offset = 0; offset < rows.length; offset += 25)
    await query(seedSql(rows.slice(offset, offset + 25)));
  const verification = await query(
    "select count(*)::int as total, count(latitude)::int as placed from public.cities;",
  );
  if (
    verification[0]?.total !== rows.length ||
    verification[0]?.placed !== rows.filter((c) => c.latitude !== null).length
  )
    throw new Error(
      "Imported collection counts do not match. Vercel was not changed.",
    );
  console.log(
    `Verified ${rows.length} imported cities and ${verification[0].placed} locations.`,
  );

  const keys = (await call(`${base}/api-keys?reveal=true`, token)) as Array<{
    name: string;
    type?: string;
    api_key: string;
  }>;
  const publicKey =
    keys.find(
      (k) =>
        k.type === "publishable" || k.api_key?.startsWith("sb_publishable_"),
    )?.api_key ?? keys.find((k) => k.name === "anon")?.api_key;
  const serviceKey =
    keys.find((k) => k.name === "service_role")?.api_key ??
    keys.find((k) => k.type === "secret")?.api_key;
  if (!publicKey || !serviceKey)
    throw new Error(
      "Project API keys could not be retrieved. No keys were printed.",
    );
  const users: Array<{ id: string; email: string }> = [];
  for (let page = 1; ; page++) {
    const result = await call(
      `${projectUrl}/auth/v1/admin/users?page=${page}&per_page=1000`,
      serviceKey,
      "GET",
      undefined,
      serviceKey,
    );
    users.push(...result.users);
    if (result.users.length < 1000) break;
  }
  let owner = users.find(
    (u) => u.email?.toLowerCase() === config.ownerEmail.toLowerCase(),
  );
  if (!owner) {
    const result = await call(
      `${projectUrl}/auth/v1/admin/users`,
      serviceKey,
      "POST",
      { email: config.ownerEmail, email_confirm: true },
      serviceKey,
    );
    owner = result.user ?? result;
  }
  if (!owner || !/^[0-9a-f-]{36}$/i.test(owner.id))
    throw new Error("The editor account could not be verified.");
  const ownerId = owner.id;
  const existingEditors = await query(
    "select user_id::text from atlas_private.editors;",
  );
  if (
    existingEditors.some(
      (editor: { user_id: string }) => editor.user_id !== ownerId,
    )
  )
    throw new Error(
      "Other editor accounts already exist. Their access was preserved; review those accounts before continuing.",
    );
  await query(
    `insert into atlas_private.editors(user_id) values ('${owner.id}'::uuid) on conflict do nothing;`,
  );
  await call(`${base}/config/auth`, token, "PATCH", {
    site_url: site.href,
    uri_allow_list: `${site.href},http://localhost:5173/`,
    disable_signup: true,
    external_email_enabled: true,
  });
  console.log(
    "Configured editor access, disabled public sign-ups, and set auth redirect URLs.",
  );

  const publicResponse = await fetch(
    `${projectUrl}/rest/v1/cities?select=id&limit=1`,
    {
      headers: { apikey: publicKey, Authorization: `Bearer ${publicKey}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!publicResponse.ok || !(await publicResponse.json()).length)
    throw new Error("Public read access failed; Vercel was not changed.");
  const denied = await fetch(
    `${projectUrl}/rest/v1/cities?id=eq.${encodeURIComponent(rows[0].id)}`,
    {
      method: "PATCH",
      headers: {
        apikey: publicKey,
        Authorization: `Bearer ${publicKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ map_status: rows[0].map_status }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (denied.ok)
    throw new Error(
      "Anonymous writes were not rejected; Vercel was not changed.",
    );
  console.log("Verified public reads and rejected anonymous status writes.");

  // Generate a test link without sending email, verify owner permissions, then
  // revoke only this temporary session. Never log or persist its link or tokens.
  const link = await call(
    `${projectUrl}/auth/v1/admin/generate_link`,
    serviceKey,
    "POST",
    {
      type: "magiclink",
      email: config.ownerEmail,
      redirect_to: site.href,
    },
    serviceKey,
  );
  const hash = link.properties?.hashed_token ?? link.hashed_token;
  if (!hash)
    throw new Error("Could not create a temporary editor test session.");
  const session = await call(
    `${projectUrl}/auth/v1/verify`,
    publicKey,
    "POST",
    { token_hash: hash, type: "magiclink" },
    publicKey,
  );
  try {
    if (session.user?.id !== owner.id || !session.access_token)
      throw new Error(
        "The editor test session did not match the requested owner.",
      );
    if (
      (await call(
        `${projectUrl}/rest/v1/rpc/atlas_can_edit`,
        session.access_token,
        "POST",
        {},
        publicKey,
      )) !== true
    )
      throw new Error("The owner does not have editor access.");
    const current = await call(
      `${projectUrl}/rest/v1/cities?id=eq.${encodeURIComponent(rows[0].id)}&select=*`,
      session.access_token,
      "GET",
      undefined,
      publicKey,
    );
    const verifyWrite = await fetch(
      `${projectUrl}/rest/v1/cities?id=eq.${encodeURIComponent(current[0].id)}&updated_at=eq.${encodeURIComponent(current[0].updated_at)}`,
      {
        method: "PATCH",
        headers: {
          apikey: publicKey,
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ map_status: current[0].map_status }),
        signal: AbortSignal.timeout(15000),
      },
    );
    if (!verifyWrite.ok || (await verifyWrite.json()).length !== 1)
      throw new Error("The owner status-save test failed.");
  } finally {
    if (session.access_token)
      await call(
        `${projectUrl}/auth/v1/logout?scope=local`,
        session.access_token,
        "POST",
        undefined,
        publicKey,
      );
  }
  console.log(
    "Verified authenticated owner access and a status save; revoked the temporary test session.",
  );

  // These are public browser credentials. Privileged tokens never enter Vercel or Git.
  for (const [key, value] of Object.entries({
    VITE_SUPABASE_URL: projectUrl,
    VITE_SUPABASE_PUBLISHABLE_KEY: publicKey,
  })) {
    await call(
      `https://api.vercel.com/v10/projects/${vercelProject.id}/env${vercelTeam}${vercelTeam ? "&" : "?"}upsert=true`,
      vercelToken,
      "POST",
      {
        key,
        value,
        type: "plain",
        target: ["production"],
      },
    );
  }
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/supabase-browser.env",
    `VITE_SUPABASE_URL=${projectUrl}\nVITE_SUPABASE_PUBLISHABLE_KEY=${publicKey}\n`,
    { mode: 0o600 },
  );
  chmodSync(".cache/supabase-browser.env", 0o600);
  console.log(
    "Configured Vercel production variables. Deploy the tested commit to activate database-backed saving.",
  );
}
main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
