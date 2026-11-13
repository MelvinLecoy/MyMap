import { readFileSync } from "node:fs";
import { importCountryHistory } from "./country-importer.js";
import starter from "../data/countries.sample.json";
import {
  toCountrySnapshot,
  type CountrySnapshot,
} from "../src/lib/country-cloud-data.js";

export function countryCollection() {
  return importCountryHistory(
    readFileSync("data/countries.csv", "utf8"),
    readFileSync("data/country-visit-history.csv", "utf8"),
    starter.countries,
    readFileSync("data/country-visit-periods.csv", "utf8"),
  );
}
/** Initial/idempotent import. Refuse to overwrite any differing existing data. */
export function countrySeedSql(snapshot: CountrySnapshot): string {
  return (
    [
      ["countries", snapshot.countries],
      ["country_visits", snapshot.visits],
      ["country_visit_periods", snapshot.periods],
    ] as const
  )
    .map(([table, rows]) => {
      if (!rows.length) return "";
      const columns = Object.keys(rows[0]).join(","),
        json = JSON.stringify(rows).replaceAll("'", "''");
      return `insert into public.${table} (${columns}) select ${columns} from jsonb_populate_recordset(null::public.${table},'${json}'::jsonb) on conflict do nothing;
do $check$ begin
if (select count(*) from public.${table})<>${rows.length} or exists(
  (select ${columns} from jsonb_populate_recordset(null::public.${table},'${json}'::jsonb))
  except (select ${columns} from public.${table})
) then raise exception 'Existing ${table} differs from the import; export and review before reimport.'; end if;
end $check$;`;
    })
    .join("\n");
}
export function countryDatabaseSql() {
  const snapshot = toCountrySnapshot(countryCollection());
  const migration = [
    "202611130001_country_history.sql",
    "202611130003_country_half_days.sql",
  ]
    .map((file) =>
      readFileSync(`supabase/migrations/${file}`, "utf8")
        .replace(/^begin;\s*/i, "")
        .replace(/commit;\s*$/i, ""),
    )
    .join("\n");
  return {
    snapshot,
    sql: `begin;\nselect pg_advisory_xact_lock(202611130001);\n${migration}\n${countrySeedSql(snapshot)}\nset constraints all immediate;\ncommit;\n`,
  };
}
