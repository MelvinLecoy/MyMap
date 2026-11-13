import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { countryDatabaseSql } from "./country-database.js";

const { snapshot, sql } = countryDatabaseSql();
mkdirSync(".cache", { recursive: true });
writeFileSync(".cache/country-history-ready.sql", sql);
console.log(
  JSON.stringify({
    countries: snapshot.countries.length,
    visits: snapshot.visits.length,
    datedVisits: new Set(
      snapshot.periods.map((p) => `${p.country_code}:${p.visit_number}`),
    ).size,
    periods: snapshot.periods.length,
    days: snapshot.periods.reduce(
      (n, p) =>
        n +
        (p.days_spent ??
          (Date.parse(p.departure_date) - Date.parse(p.arrival_date)) /
            86400000 +
            1),
      0,
    ),
  }),
);
if (process.argv.includes("--apply") || process.argv.includes("--dry-run")) {
  if (process.argv.includes("--apply") && process.argv.includes("--dry-run"))
    throw new Error("Choose apply or dry-run, not both.");
  const dryRun = process.argv.includes("--dry-run");
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
      `Country database import failed (${response.status}): ${await response.text()}`,
    );
  console.log(
    dryRun
      ? "Country migration and import verified on Supabase, then rolled back. No remote data retained."
      : "Country migration and import committed atomically. City data was not modified.",
  );
} else
  console.log(
    "Prepared .cache/country-history-ready.sql; no remote changes applied.",
  );
