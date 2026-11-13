import { readFileSync } from "node:fs";
import { countryCollection } from "./country-database.js";
import { cityCollection } from "./city-database.js";
import { calculateRecordedHistory } from "../src/lib/country-history.js";
import { toCountrySnapshot } from "../src/lib/country-cloud-data.js";
import { toCityVisitRows } from "../src/lib/city-cloud-data.js";

export function durationUpdatePlan() {
  const countries = countryCollection(),
    cities = cityCollection();
  const ledger = JSON.parse(
    readFileSync("data/sources/country-duration-corrections.json", "utf8"),
  ) as {
    changes: {
      code: string;
      arrival: string;
      previousArrival?: string;
      previousDeparture?: string;
      previousDays?: number;
      added?: boolean;
    }[];
  };
  const previousCountries = structuredClone(countries);
  for (const change of ledger.changes) {
    const country = previousCountries.find((c) => c.code === change.code)!;
    const visit = country.visits!.find((v) =>
      v.periods?.some((p) => p.arrival === change.arrival),
    )!;
    const period = visit.periods!.find((p) => p.arrival === change.arrival)!;
    if (change.added)
      visit.periods = visit.periods!.filter((p) => p !== period);
    else {
      period.arrival = change.previousArrival ?? period.arrival;
      period.departure = change.previousDeparture!;
      delete period.daysSpent;
    }
  }
  for (const c of previousCountries)
    for (const v of c.visits ?? [])
      if (v.periods?.length) {
        v.arrival = v.periods[0].arrival;
        v.departure = v.periods.at(-1)!.departure;
        v.daysSpent = null;
      }
  calculateRecordedHistory(previousCountries);
  const before = toCountrySnapshot(previousCountries),
    after = toCountrySnapshot(countries);
  const cityAfter = toCityVisitRows(cities),
    cityBefore = structuredClone(cityAfter);
  cityBefore.find(
    (v) => v.city_id === "shanghai-china" && v.arrival_date === "2026-08-30",
  )!.days_spent = 2;
  cityBefore.find(
    (v) =>
      v.city_id === "singapore-singapore" && v.arrival_date === "2026-09-11",
  )!.days_spent = 1.5;
  return { before, after, cityBefore, cityAfter };
}

type Row = Record<string, unknown>;
const json = (x: unknown) =>
  `'${JSON.stringify(x).replaceAll("'", "''")}'::jsonb`;

/** Accept only the approved before/after rows, preserve every other database row. */
export function durationUpdateSql() {
  const plan = durationUpdatePlan();
  const tables = [
    {
      name: "country_visits",
      part: "visits",
      scope: "countries",
      keys: ["country_code", "visit_number"],
      before: plan.before.visits,
      after: plan.after.visits,
    },
    {
      name: "country_visit_periods",
      part: "periods",
      scope: "countries",
      keys: ["country_code", "visit_number", "period_number"],
      before: plan.before.periods,
      after: plan.after.periods,
    },
    {
      name: "city_visits",
      part: "visits",
      scope: "cities",
      keys: ["city_id", "visit_number"],
      before: plan.cityBefore,
      after: plan.cityAfter,
    },
  ];
  let sql = readFileSync(
    "supabase/migrations/202611130003_country_half_days.sql",
    "utf8",
  )
    .replace(/^begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  sql += `\ncreate temporary table duration_update_before on commit drop as select public.atlas_country_snapshot() as countries, public.atlas_city_snapshot() as cities;\n`;
  const checks: string[] = [];
  const counts: Record<string, number> = {};
  for (const table of tables) {
    const key = (r: Row) => table.keys.map((k) => r[k]).join(":");
    const original = new Map(
      (table.before as unknown as Row[]).map((r) => [key(r), r]),
    );
    const next = (table.after as unknown as Row[]).filter(
      (r) => JSON.stringify(original.get(key(r))) !== JSON.stringify(r),
    );
    const prior = next.flatMap((r) =>
      original.has(key(r)) ? [original.get(key(r))!] : [],
    );
    counts[table.name] = next.length;
    const columns = Object.keys(next[0]),
      join = table.keys.map((k) => `c.${k}=n.${k}`).join(" and ");
    const pair = (a: string, b: string) =>
      table.keys.map((k) => `${a}.${k}=${b}.${k}`).join(" and ");
    sql += `
do $guard$ begin if exists (
  select 1 from jsonb_populate_recordset(null::public.${table.name},${json(next)}) n
  left join public.${table.name} c on ${join}
  left join jsonb_populate_recordset(null::public.${table.name},${json(prior)}) b on ${pair("b", "n")}
  where (c.${table.keys[0]} is null and b.${table.keys[0]} is not null)
    or (c.${table.keys[0]} is not null and to_jsonb(c) is distinct from to_jsonb(n) and (b.${table.keys[0]} is null or to_jsonb(c) is distinct from to_jsonb(b)))
) then raise exception 'Existing ${table.name} differs from the approved correction; nothing changed.'; end if; end $guard$;
insert into public.${table.name} (${columns.join(",")}) select ${columns.join(",")} from jsonb_populate_recordset(null::public.${table.name},${json(next)})
on conflict (${table.keys.join(",")}) do update set ${columns
      .filter((c) => !table.keys.includes(c))
      .map((c) => `${c}=excluded.${c}`)
      .join(",")}
where to_jsonb(${table.name}) is distinct from to_jsonb(excluded)
  and exists(select 1 from jsonb_populate_recordset(null::public.${table.name},${json(prior)}) b
    where ${table.keys.map((k) => `b.${k}=${table.name}.${k}`).join(" and ")} and to_jsonb(b)=to_jsonb(${table.name}));
`;
    const keyJson = (r: string) =>
      table.keys.map((k) => `(${r}->>'${k}')`).join("||':'||");
    const keys = next.map(key);
    checks.push(`
  select coalesce(jsonb_agg(r),'[]'::jsonb) into expected from (
    select r from duration_update_before b, jsonb_array_elements(b.${table.scope}->'${table.part}') r where not (${keyJson("r")} = any(array[${keys.map((k) => `'${k}'`).join(",")}]::text[]))
    union all select r from jsonb_array_elements(${json(next)}) r
  ) records;
  actual:=public.atlas_${table.scope === "countries" ? "country" : "city"}_snapshot()->'${table.part}';
  if not (actual @> expected and expected @> actual) then raise exception 'Unrelated ${table.name} rows changed; rolling back.'; end if;
`);
  }
  sql += `
set constraints all immediate;
do $check$ declare expected jsonb;actual jsonb; begin
  if (select countries->'countries' from duration_update_before) is distinct from (public.atlas_country_snapshot()->'countries')
    or (select cities->'cities' from duration_update_before) is distinct from (public.atlas_city_snapshot()->'cities')
    then raise exception 'Country metadata or city metadata changed; rolling back.'; end if;
${checks.join("\n")}
end $check$;
`;
  return {
    ...plan,
    counts,
    sql: `begin;\nselect pg_advisory_xact_lock(202611130003);\n${sql}\ncommit;\n`,
  };
}
