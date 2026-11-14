import { readFileSync } from "node:fs";
import { countryCollection } from "./country-database.js";
import {
  toCountrySnapshot,
  type CountrySnapshot,
} from "../src/lib/country-cloud-data.js";

export function countryVisitUpdatePlan() {
  const ledger = JSON.parse(
    readFileSync("data/sources/country-visit-updates-2026-11-14.json", "utf8"),
  ) as {
    changes: { code: string }[];
    before: Pick<CountrySnapshot, "visits" | "periods">;
  };
  const codes = [...new Set(ledger.changes.map((c) => c.code))].sort();
  const snapshot = toCountrySnapshot(countryCollection());
  const sort = <
    T extends {
      country_code: string;
      visit_number: number;
      period_number?: number;
    },
  >(
    rows: T[],
  ) =>
    [...rows].sort(
      (a, b) =>
        a.country_code.localeCompare(b.country_code) ||
        a.visit_number - b.visit_number ||
        (a.period_number ?? 0) - (b.period_number ?? 0),
    );
  const before = {
    visits: sort(ledger.before.visits),
    periods: sort(ledger.before.periods),
  };
  const after = {
    visits: sort(snapshot.visits.filter((v) => codes.includes(v.country_code))),
    periods: sort(
      snapshot.periods.filter((p) => codes.includes(p.country_code)),
    ),
  };
  const json = (value: unknown) =>
    `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
  const scope = `array[${codes.map((c) => `'${c}'`).join(",")}]::text[]`;
  const visits = `coalesce((select jsonb_agg(to_jsonb(v) order by v.country_code,v.visit_number) from public.country_visits v where country_code=any(${scope})),'[]'::jsonb)`;
  const periods = `coalesce((select jsonb_agg(to_jsonb(p) order by p.country_code,p.visit_number,p.period_number) from public.country_visit_periods p where country_code=any(${scope})),'[]'::jsonb)`;
  const sql = `begin;
select pg_advisory_xact_lock(202611130001);
select pg_advisory_xact_lock(202611140001);
create temporary table country_updates_before on commit drop as
 select public.atlas_city_snapshot() as cities,public.atlas_country_snapshot() as countries;
do $patch$ declare actual_visits jsonb;actual_periods jsonb;old_visits jsonb;old_periods jsonb;new_visits jsonb;new_periods jsonb;
 code_value text;needed text[]:=array[]::text[];begin
 foreach code_value in array ${scope} loop
  select coalesce(jsonb_agg(to_jsonb(v) order by v.visit_number),'[]'::jsonb) into actual_visits from public.country_visits v where country_code=code_value;
  select coalesce(jsonb_agg(to_jsonb(p) order by p.visit_number,p.period_number),'[]'::jsonb) into actual_periods from public.country_visit_periods p where country_code=code_value;
  select coalesce(jsonb_agg(r),'[]'::jsonb) into old_visits from jsonb_array_elements(${json(before.visits)}) r where r->>'country_code'=code_value;
  select coalesce(jsonb_agg(r),'[]'::jsonb) into old_periods from jsonb_array_elements(${json(before.periods)}) r where r->>'country_code'=code_value;
  select coalesce(jsonb_agg(r),'[]'::jsonb) into new_visits from jsonb_array_elements(${json(after.visits)}) r where r->>'country_code'=code_value;
  select coalesce(jsonb_agg(r),'[]'::jsonb) into new_periods from jsonb_array_elements(${json(after.periods)}) r where r->>'country_code'=code_value;
  if actual_visits=new_visits and actual_periods=new_periods then continue;end if;
  if actual_visits is distinct from old_visits or actual_periods is distinct from old_periods
   then raise exception 'Country % differs from the approved old/new values; export and review before updating.',code_value;end if;
  needed:=array_append(needed,code_value);
 end loop;
 if array_length(needed,1) is null then return;end if;
 delete from public.country_visit_periods where country_code=any(needed);
 delete from public.country_visits where country_code=any(needed);
 insert into public.country_visits(country_code,visit_number,arrival_date,departure_date,days_spent,notes)
 select country_code,visit_number,arrival_date,departure_date,days_spent,notes from jsonb_populate_recordset(null::public.country_visits,${json(after.visits)}) where country_code=any(needed);
 insert into public.country_visit_periods(country_code,visit_number,period_number,arrival_date,departure_date,days_spent,source_refs,notes)
 select country_code,visit_number,period_number,arrival_date,departure_date,days_spent,source_refs,notes from jsonb_populate_recordset(null::public.country_visit_periods,${json(after.periods)}) where country_code=any(needed);
end $patch$;
set constraints all immediate;
do $check$ declare old_data jsonb;new_data jsonb;part text;old_rows jsonb;new_rows jsonb;begin
 select countries into old_data from country_updates_before;new_data:=public.atlas_country_snapshot();
 if (select cities from country_updates_before) is distinct from public.atlas_city_snapshot()
 or old_data->'countries' is distinct from new_data->'countries'
 then raise exception 'City data or country metadata changed; rolling back.';end if;
 foreach part in array array['visits','periods'] loop
  select coalesce(jsonb_agg(r),'[]'::jsonb) into old_rows from jsonb_array_elements(old_data->part) r where not (r->>'country_code'=any(${scope}));
  select coalesce(jsonb_agg(r),'[]'::jsonb) into new_rows from jsonb_array_elements(new_data->part) r where not (r->>'country_code'=any(${scope}));
  if old_rows is distinct from new_rows then raise exception 'Unrelated country history changed; rolling back.';end if;
 end loop;
 if ${visits} is distinct from ${json(after.visits)} or ${periods} is distinct from ${json(after.periods)}
 then raise exception 'Country update verification failed; rolling back.';end if;
end $check$;
commit;
`;
  return { codes, before, after, snapshot, sql };
}
