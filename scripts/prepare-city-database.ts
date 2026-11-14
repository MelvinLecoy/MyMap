import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { cityDatabaseSql } from "./city-database.js";
import {
  toCityPeriodRows,
  toCityVisitRows,
} from "../src/lib/city-cloud-data.js";

const { cities, sql } = cityDatabaseSql();
const visits = toCityVisitRows(cities);
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/city-history-ready.sql", sql);
console.log(
  JSON.stringify({
    cities: new Set(visits.map((v) => v.city_id)).size,
    visits: visits.length,
    stays: toCityPeriodRows(cities).length,
    days: visits.reduce((n, v) => n + v.days_spent, 0),
    collection: cities.length,
  }),
);
const apply = process.argv.includes("--apply"),
  dryRun = process.argv.includes("--dry-run");
if (apply && dryRun) throw new Error("Choose apply or dry-run, not both.");
if (apply || dryRun) {
  const config = JSON.parse(readFileSync(".cache/cloud-setup.json", "utf8"));
  if (
    !/^[a-z0-9]{20}$/.test(config.projectRef) ||
    !process.env.SUPABASE_ACCESS_TOKEN
  )
    throw new Error(
      "A configured project and management credential are required.",
    );
  const response = await fetch(
    `https://api.supabase.com/v1/projects/${config.projectRef}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: dryRun ? sql.replace(/commit;\s*$/i, "rollback;\n") : sql,
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      `City history import failed (${response.status}): ${await response.text()}`,
    );
  console.log(
    dryRun
      ? "City migration and import verified on Supabase, then rolled back."
      : "City history committed atomically; country data and other city fields preserved.",
  );
} else
  console.log(
    "Prepared .cache/city-history-ready.sql; no remote changes applied.",
  );
