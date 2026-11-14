import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { countryVisitUpdatePlan } from "./country-visit-updates.js";
import { verifyData, type PersistentData } from "./data-integrity.js";
const { sql } = countryVisitUpdatePlan();
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/country-visit-updates-ready.sql", sql);
const apply = process.argv.includes("--apply"),
  dry = process.argv.includes("--dry-run");
if (apply && dry) throw new Error("Choose apply or dry-run.");
if (!apply && !dry) {
  console.log(
    "Prepared .cache/country-visit-updates-ready.sql; no database changes.",
  );
  process.exit(0);
}
const { projectRef } = JSON.parse(
  readFileSync(".cache/cloud-setup.json", "utf8"),
);
if (!/^[a-z0-9]{20}$/.test(projectRef) || !process.env.SUPABASE_ACCESS_TOKEN)
  throw new Error("Configured project and management credential required.");
async function query(query: string) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  if (!r.ok)
    throw new Error(`Country update failed (${r.status}): ${await r.text()}`);
  return r.json();
}
await query(dry ? sql.replace(/commit;\s*$/i, "rollback;") : sql);
console.log(
  dry
    ? "Country updates verified and rolled back."
    : "Country updates committed; city data and all other country fields preserved.",
);
if (apply) {
  const data = (
    await query(
      "select atlas_city_snapshot() as cities,atlas_country_snapshot() as countries;",
    )
  )[0] as PersistentData;
  const report = verifyData(data);
  writeFileSync(
    ".cache/country-visit-updates-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  if (!report.matches) throw new Error(JSON.stringify(report.issues));
  console.log(JSON.stringify(report, null, 2));
}
