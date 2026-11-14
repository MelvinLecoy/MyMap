import { readFileSync } from "node:fs";
import { importCities } from "./importer.js";
import { toCityRow } from "../src/lib/cloud-data.js";
import { toCityVisitRows } from "../src/lib/city-cloud-data.js";
import type { City } from "../src/lib/types.js";

export function cityCollection(): City[] {
  return importCities(readFileSync("data/cities.csv", "utf8"), {
    coordinates: readFileSync("data/coordinates.csv", "utf8"),
    cityVisits: readFileSync("data/city-visit-history.csv", "utf8"),
  }).data.cities;
}
const sqlJson = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const newIds = ["rome-italy", "vatican-city-vatican-city", "austin-usa", "san-antonio-usa"];

/** Scoped initial/idempotent import. Existing differing histories require a new review. */
export function citySeedSql(cities: City[]): string {
  const visits = toCityVisitRows(cities);
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

insert into public.city_visits (${historyColumns})
  select ${historyColumns} from jsonb_populate_recordset(null::public.city_visits,${sqlJson(visits)}) on conflict do nothing;
do $check$ begin
  if (select count(*) from public.city_visits where city_id in (select id from approved_city_targets)) <> ${visits.length} or exists(
    (select ${historyColumns} from jsonb_populate_recordset(null::public.city_visits,${sqlJson(visits)}))
    except (select ${historyColumns} from public.city_visits)
  ) then raise exception 'Existing city history differs from the approved CSV; export and review before reimport.'; end if;
end $check$;

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
  const migration = readFileSync(
    "supabase/migrations/202611130002_city_history.sql",
    "utf8",
  )
    .replace(/^begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  return {
    cities,
    sql: `begin;\nselect pg_advisory_xact_lock(202611130002);\n${migration}\n${citySeedSql(cities)}\ncommit;\n`,
  };
}
