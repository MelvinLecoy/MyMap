import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dataPersistenceSql } from "./data-persistence.js";
import { verifyData, type PersistentData } from "./data-integrity.js";

const apply = process.argv.includes("--apply"),
  dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose apply or dry-run, not both.");
const { projectRef } = JSON.parse(
  readFileSync(".cache/cloud-setup.json", "utf8"),
);
if (!/^[a-z0-9]{20}$/.test(projectRef) || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error(
    "Configured Supabase project and management credential are required.",
  );
async function query(sql: string) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!r.ok)
    throw new Error(
      `Data verification failed (${r.status}): ${await r.text()}`,
    );
  return r.json();
}
mkdirSync(".cache", { recursive: true });
if (apply || dryRun) {
  const { sql } = dataPersistenceSql();
  writeFileSync(".cache/data-persistence-ready.sql", sql);
  await query(dryRun ? sql.replace(/commit;\s*$/i, "rollback;") : sql);
  console.log(
    dryRun
      ? "Approved city synchronization verified and rolled back."
      : "Approved city synchronization committed atomically.",
  );
}
const snapshot = (
  await query(
    "select public.atlas_city_snapshot() as cities,public.atlas_country_snapshot() as countries;",
  )
)[0] as PersistentData;
const report = verifyData(snapshot);
writeFileSync(
  ".cache/data-integrity-report.json",
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    dryRun
      ? {
          candidateVerified: true,
          rolledBack: true,
          retainedLiveData: { ...report, issues: report.issues.slice(0, 12) },
        }
      : { ...report, issues: report.issues.slice(0, 12) },
    null,
    2,
  ),
);
if (!report.matches && !dryRun)
  throw new Error(
    "CSV/database data differs; see .cache/data-integrity-report.json.",
  );
