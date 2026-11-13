import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { durationUpdateSql } from "./duration-updates.js";

const { sql, counts, after, cityAfter } = durationUpdateSql();
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/duration-updates-ready.sql", sql);
console.log(
  JSON.stringify({
    changedRows: counts,
    countryDays: after.visits.reduce((n, v) => n + (v.days_spent ?? 0), 0),
    cityDays: cityAfter.reduce((n, v) => n + v.days_spent, 0),
  }),
);
const apply = process.argv.includes("--apply"),
  dryRun = process.argv.includes("--dry-run");
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
      `Duration update failed (${response.status}): ${await response.text()}`,
    );
  console.log(
    dryRun
      ? "Approved duration updates verified and rolled back."
      : "Approved duration updates committed atomically.",
  );
} else
  console.log(
    "Prepared .cache/duration-updates-ready.sql; no live database changes.",
  );
