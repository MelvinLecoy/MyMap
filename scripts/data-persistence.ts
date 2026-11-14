import { readFileSync } from "node:fs";
import { cityCollection, citySeedSql } from "./city-database.js";
import { csvData } from "./data-integrity.js";

const body = (file: string) =>
  readFileSync(`supabase/migrations/${file}`, "utf8")
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/commit;\s*$/i, "");
const literal = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

/** Apply only reviewed city changes, and require complete CSV equality before commit. */
export function dataPersistenceSql() {
  const expected = csvData();
  const patches = [
    "202611130004_city_visit_owner_corrections.sql",
    "202611130005_city_visit_additions.sql",
  ];
  const apply = patches
    .map(
      (file, i) =>
        `execute $approved_patch_${i}$${body(file)}$approved_patch_${i}$;`,
    )
    .join("\n");
  let sql = `begin;\nselect pg_advisory_xact_lock(202611140001);\n${body("202611130002_city_history.sql")}\ncreate temporary table persistence_country_before on commit drop as select public.atlas_country_snapshot() as data;\ndo $patches$ begin if exists(select 1 from public.city_visits) then\n${apply}\nend if;end $patches$;\n${citySeedSql(cityCollection())}\n`;
  for (const [table, rows] of [
    ["cities", expected.cities.cities],
    ["city_visits", expected.cities.visits],
    ["countries", expected.countries.countries],
    ["country_visits", expected.countries.visits],
    ["country_visit_periods", expected.countries.periods],
  ] as const) {
    const columns = Object.keys(rows[0]).join(","),
      temp = `persistence_expected_${table}`;
    sql += `create temporary table ${temp} on commit drop as select ${columns} from jsonb_populate_recordset(null::public.${table},${literal(rows)});
do $check$ begin if exists((select ${columns} from ${temp}) except (select ${columns} from public.${table})) or exists((select ${columns} from public.${table}) except (select ${columns} from ${temp})) then raise exception '${table} differs from the approved CSV; export and review before synchronizing.';end if;end $check$;\n`;
  }
  sql += `set constraints all immediate;\ndo $country$ begin if (select data from persistence_country_before) is distinct from public.atlas_country_snapshot() then raise exception 'Country history changed during city synchronization; rolling back.';end if;end $country$;\ncommit;\n`;
  return { expected, sql };
}
