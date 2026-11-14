import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const legacySql = readFileSync(
  "supabase/migrations/202611130004_city_visit_owner_corrections.sql",
  "utf8",
);
const sql = legacySql.replace(
  /begin;/i,
  `begin;\nselect pg_advisory_xact_lock(202611140001);\ndo $legacy_guard$ begin if to_regclass('public.city_visit_periods') is not null then raise exception 'Historical patch predates city grouping. Use data:sync-approved for the current CSVs.';end if;end $legacy_guard$;`,
);
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/city-corrections-ready.sql", sql);
const apply = process.argv.includes("--apply");
const dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose apply or dry-run, not both.");

if (apply || dryRun) {
  const { projectRef } = JSON.parse(
    readFileSync(".cache/cloud-setup.json", "utf8"),
  );
  if (!/^[a-z0-9]{20}$/.test(projectRef) || !process.env.SUPABASE_ACCESS_TOKEN)
    throw new Error(
      "Configured Supabase project and management credential are required.",
    );
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: dryRun ? sql.replace(/commit;\s*$/i, "rollback;") : sql,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `City correction failed (${response.status}): ${await response.text()}`,
    );
  console.log(
    dryRun
      ? "Four approved city corrections verified and rolled back."
      : "Four approved city corrections committed atomically.",
  );
} else
  console.log(
    "Prepared .cache/city-corrections-ready.sql; no live database changes.",
  );
