import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { backendAuditSql } from "./backend-architecture";
import { conciseStorageSql } from "./concise-storage";

const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose apply or dry-run, not both.");
const { projectRef } = JSON.parse(
  readFileSync(".cache/cloud-setup.json", "utf8"),
);
if (!/^[a-z0-9]{20}$/.test(projectRef) || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error(
    "Configured Supabase project and management credential required.",
  );

async function query(sql: string): Promise<Record<string, unknown>[]> {
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
      signal: AbortSignal.timeout(90000),
    },
  );
  if (!response.ok)
    throw new Error(`Backend management query failed (${response.status}).`);
  return response.json();
}

mkdirSync(".cache", { recursive: true });
const plan = conciseStorageSql(dryRun);
if (apply || dryRun) {
  writeFileSync(".cache/backend-architecture-ready.sql", plan.sql);
  await query(plan.sql);
}
const audit = (await query(backendAuditSql))[0].audit as {
  collection_rpc_present: boolean;
  tables: { schema: string; name: string }[];
  public_access: {
    table: string;
    rls: boolean;
    read: boolean;
    write: boolean;
  }[];
  snapshot_counts: Record<string, number>;
  business_fingerprint: string;
};
if (
  audit.public_access.length !== 8 ||
  audit.public_access.some((table) => !table.rls || !table.read || table.write)
)
  throw new Error(
    "Public collection access differs from the read-only RLS contract.",
  );
if (apply && !audit.collection_rpc_present)
  throw new Error("The collection snapshot RPC is missing after migration.");
const registry = audit.tables.some(
  (table) =>
    table.schema === "atlas_private" && table.name === "schema_migrations",
)
  ? await query(
      "select version,checksum,applied_at from atlas_private.schema_migrations order by version",
    )
  : [];
const report = {
  mode: apply ? "applied" : dryRun ? "verified-and-rolled-back" : "read-only",
  candidate: { version: plan.version, checksum: plan.checksum },
  ...audit,
  migration_registry: registry,
};
writeFileSync(
  ".cache/backend-audit-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      mode: report.mode,
      collection_rpc_present: audit.collection_rpc_present,
      snapshot_counts: audit.snapshot_counts,
      business_fingerprint: audit.business_fingerprint,
      registered_migrations: registry.length,
      report: ".cache/backend-audit-report.json",
    },
    null,
    2,
  ),
);
