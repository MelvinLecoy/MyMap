import { readFileSync } from "node:fs";
import { importCities } from "./importer.js";
import { toCityRow } from "../src/lib/cloud-data.js";
import {
  toCityPeriodRows,
  toCityStayRows,
  toCityVisitRows,
} from "../src/lib/city-cloud-data.js";
import type { City } from "../src/lib/types.js";

export function cityCollection(): City[] {
  return importCities(readFileSync("data/cities.csv", "utf8"), {
    coordinates: readFileSync("data/coordinates.csv", "utf8"),
    cityVisits: readFileSync("data/city-visit-history.csv", "utf8"),
    cityPeriods: readFileSync("data/city-visit-periods.csv", "utf8"),
  }).data.cities;
}
const sqlJson = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const newIds = [
  "rome-italy",
  "vatican-city-vatican-city",
  "austin-usa",
  "san-antonio-usa",
  ...(
    JSON.parse(
      readFileSync("data/sources/city-visit-batches.json", "utf8"),
    ) as {
      batches: { newCities: { cityid: string }[] }[];
    }
  ).batches.flatMap((batch) => batch.newCities.map((city) => city.cityid)),
];

/** Scoped initial/idempotent import. Existing differing histories require a new review. */
export function citySeedSql(cities: City[], legacy = false): string {
  const visits = legacy ? toCityStayRows(cities) : toCityVisitRows(cities);
  const periods = toCityPeriodRows(cities);
  if (!visits.length) throw new Error("The city history import is empty.");
  const targets = cities
    .filter((c) => c.visits?.length)
    .map((c) => ({
      id: c.id,
      country_code: c.countryCode,
      last_visited: c.lastVisited,
    }));
  const additions = cities.filter((c) => newIds.includes(c.id)).map(toCityRow);
  const columns = Object.keys(toCityRow(cities[0])).join(",");
  const historyColumns =
    "city_id,visit_number,arrival_date,departure_date,days_spent";
  const insertHistory = (table: string, rows: object[], columns: string) => `
insert into public.${table} (${columns})
  select ${columns} from jsonb_populate_recordset(null::public.${table},${sqlJson(rows)}) on conflict do nothing;
do $check$ begin
  if (select count(*) from public.${table} where city_id in (select id from approved_city_targets)) <> ${rows.length} or exists(
    (select ${columns} from jsonb_populate_recordset(null::public.${table},${sqlJson(rows)}))
    except (select ${columns} from public.${table})
  ) then raise exception 'Existing ${table} differs from the approved CSV; export and review before reimport.'; end if;
end $check$;
`;
  return `
create temporary table approved_city_targets on commit drop as
  select * from jsonb_to_recordset(${sqlJson(targets)}) as x(id text,country_code text,last_visited text);
create temporary table city_import_before on commit drop as
  select id, case when id in (select id from approved_city_targets)
    then to_jsonb(c)-array['visit_status','last_visited','updated_at'] else to_jsonb(c) end as data
  from public.cities c;
create temporary table country_import_before on commit drop as select public.atlas_country_snapshot() as data;

insert into public.cities (${columns})
  select ${columns} from jsonb_populate_recordset(null::public.cities,${sqlJson(additions)}) on conflict (id) do nothing;
do $check$ begin
  if exists(select 1 from approved_city_targets t left join public.cities c using(id) where c.id is null or c.country_code is distinct from t.country_code)
    then raise exception 'Missing or mismatched target city; nothing imported.'; end if;
end $check$;

${insertHistory("city_visits", visits, historyColumns)}
${legacy ? "" : insertHistory("city_visit_periods", periods, "city_id,visit_number,period_number,arrival_date,departure_date,days_spent")}

update public.cities c set visit_status='visited',last_visited=t.last_visited
  from approved_city_targets t where c.id=t.id
  and (c.visit_status,c.last_visited) is distinct from ('visited'::text,t.last_visited);
set constraints all immediate;
do $check$ begin
  if (select data from country_import_before) is distinct from public.atlas_country_snapshot()
    then raise exception 'Country data changed during city import; rolling back.'; end if;
  if exists(select 1 from city_import_before b left join public.cities c using(id)
    where c.id is null or b.data is distinct from case when c.id in (select id from approved_city_targets)
      then to_jsonb(c)-array['visit_status','last_visited','updated_at'] else to_jsonb(c) end)
    then raise exception 'An unrelated city field changed during import; rolling back.'; end if;
end $check$;
`;
}

export function cityDatabaseSql() {
  const cities = cityCollection();
  return {
    cities,
    sql: `begin;\nselect pg_advisory_xact_lock(202611140001);\n${legacyCitySchemaSql()}\n${migrationBody("202611140002_city_visit_periods.sql")}\n${migrationBody("202611140003_seoul_visit_correction.sql")}\n${citySeedSql(cities)}\ncommit;\n`,
  };
}

export const migrationBody = (file: string) =>
  readFileSync(`supabase/migrations/${file}`, "utf8")
    .replace(/^\s*begin;\s*$/im, "")
    .replace(/commit;\s*$/i, "");
export const legacyCitySchemaSql = () => `do $legacy_schema$ begin
  if to_regclass('public.city_visit_periods') is null then
    execute $city_schema$${migrationBody("202611130002_city_history.sql")}$city_schema$;
  end if;
end $legacy_schema$;`;
