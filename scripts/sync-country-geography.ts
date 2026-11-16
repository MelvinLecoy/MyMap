import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import type { CountryGeography } from "../src/lib/country-geography";
import { importCountryGeography } from "./country-geography-importer";
import { countryCollection } from "./country-database";
import { collectionRows } from "./supabase-data";

const TABLE_KEYS = {
  cities: ["id"],
  city_visits: ["city_id", "visit_number"],
  city_visit_periods: ["city_id", "visit_number", "period_number"],
  countries: ["code"],
  country_visits: ["country_code", "visit_number"],
  country_visit_periods: ["country_code", "visit_number", "period_number"],
  places: ["id"],
  place_countries: ["place_id", "country_code"],
} as const;
type Table = keyof typeof TABLE_KEYS;
type Row = Record<string, unknown>;
export type GeographySnapshot = Record<Table, Row[]>;
export interface CityIdentity {
  id: string;
  country_code: string | null;
}

/** Ordered full rows include revisions and future columns, not just known fields. */
export const geographySnapshotExpression = `jsonb_build_object(${Object.entries(
  TABLE_KEYS,
)
  .map(
    ([table, keys]) =>
      `'${table}',(select coalesce(jsonb_agg(to_jsonb(t) order by ${keys.map((key) => `t.${key}`).join(",")}), '[]'::jsonb) from public.${table} t)`,
  )
  .join(",")})`;
export const geographySnapshotQuery = `select ${geographySnapshotExpression} as snapshot;`;
const literal = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
const geography = (row: Row) => ({
  continent: row.continent,
  region: row.region,
  subregion: row.subregion,
});

/** A scoped reviewed update: all unrelated public data is an invariant. */
export function countryGeographySyncPlan(
  snapshot: GeographySnapshot,
  reference: CountryGeography[],
  identities: CityIdentity[],
) {
  for (const table of Object.keys(TABLE_KEYS) as Table[])
    if (!Array.isArray(snapshot?.[table]))
      throw new Error(`Incomplete geography snapshot: ${table}.`);
  const byCode = new Map(reference.map((row) => [row.code, row]));
  if (byCode.size !== reference.length)
    throw new Error("Duplicate country geography code.");
  const cityIds = new Map(identities.map((row) => [row.id, row.country_code]));
  if (cityIds.size !== identities.length || !cityIds.size)
    throw new Error("Invalid repository city identity manifest.");
  const countries = new Map(snapshot.countries.map((row) => [row.code, row]));
  if (
    countries.size !== snapshot.countries.length ||
    [...byCode.keys()].some((code) => !countries.has(code)) ||
    [...countries.keys()].some(
      (code) =>
        typeof code !== "string" || (!byCode.has(code) && code !== "SJ"),
    )
  )
    throw new Error(
      "Database country identities differ from the reviewed geography.",
    );
  for (const [code, row] of byCode)
    if (countries.get(code)!.continent !== row.continent)
      throw new Error(
        `Country ${code} continent requires a separate reviewed correction.`,
      );
  const seen = new Set<string>();
  const wanted: Row[] = [];
  const changes: { id: string; code: string; from: Row; to: Row }[] = [];
  for (const city of snapshot.cities) {
    if (
      typeof city.id !== "string" ||
      seen.has(city.id) ||
      !cityIds.has(city.id) ||
      cityIds.get(city.id) !== city.country_code ||
      typeof city.updated_at !== "string" ||
      !Number.isFinite(Date.parse(city.updated_at))
    )
      throw new Error(
        "Database city identities or revisions differ from the repository.",
      );
    seen.add(city.id);
    const code = city.country_code as string;
    const row = byCode.get(code);
    if (!row) {
      if (code === "SJ") continue;
      throw new Error(`No reviewed country geography for ${city.id}.`);
    }
    const target = geography(row as unknown as Row);
    wanted.push({
      id: city.id,
      country_code: code,
      ...target,
      updated_at: city.updated_at,
    });
    if (!isDeepStrictEqual(geography(city), target))
      changes.push({ id: city.id, code, from: geography(city), to: target });
  }
  if (seen.size !== cityIds.size)
    throw new Error("Database city identities differ from the repository.");
  // Data literals stay outside dollar-quoted blocks: saved notes cannot become SQL.
  const sql = `begin;
select pg_advisory_xact_lock(202611160002);
lock table ${Object.keys(TABLE_KEYS)
    .map((table) => `public.${table}`)
    .join(",")} in share row exclusive mode;
create temporary table taxonomy_before(data jsonb) on commit drop;
insert into taxonomy_before values (${literal(snapshot)});
create temporary table taxonomy_wanted on commit drop as
select * from jsonb_to_recordset(${literal(wanted)}) as r(id text,country_code text,continent text,region text,subregion text,updated_at timestamptz);
create temporary table taxonomy_reference on commit drop as
select * from jsonb_to_recordset(${literal(reference)}) as r(code text,continent text,region text,subregion text);
do $taxonomy_guard$ begin
  if ${geographySnapshotExpression} is distinct from (select data from taxonomy_before) then
    raise exception 'Collection changed since geography review; refresh and review again.' using errcode='40001';
  end if;
end $taxonomy_guard$;
create temporary table taxonomy_changed on commit drop as
select c.id from public.cities c join taxonomy_wanted w on c.id=w.id
where row(c.continent,c.region,c.subregion) is distinct from row(w.continent,w.region,w.subregion);
do $taxonomy_apply$ declare affected integer; begin
  if to_regclass('atlas_data.countries') is not null then
    execute 'update atlas_data.countries c set region=r.region,subregion=r.subregion from taxonomy_reference r where c.code=r.code and row(c.region,c.subregion) is distinct from row(r.region,r.subregion)';
    execute 'update atlas_data.cities set updated_at=clock_timestamp() where id in (select id from taxonomy_changed)';
    get diagnostics affected=row_count;
  else
  update public.cities c set continent=w.continent,region=w.region,subregion=w.subregion
  from taxonomy_wanted w where c.id=w.id and c.country_code is not distinct from w.country_code
    and c.updated_at=w.updated_at
    and row(c.continent,c.region,c.subregion) is distinct from row(w.continent,w.region,w.subregion);
  get diagnostics affected=row_count;
  end if;
  if affected<>(select count(*) from taxonomy_changed) then
    raise exception 'A city revision changed during geography update.' using errcode='40001';
  end if;
end $taxonomy_apply$;
set constraints all immediate;
create temporary table taxonomy_after(data) on commit drop as select ${geographySnapshotExpression};
do $taxonomy_verify$ begin
  if exists(select 1 from public.cities c join taxonomy_wanted w on c.id=w.id
    where row(c.continent,c.region,c.subregion) is distinct from row(w.continent,w.region,w.subregion)) then
    raise exception 'Geography update did not preserve the reviewed taxonomy.';
  end if;
  if (select data-'cities' from taxonomy_before) is distinct from (select data-'cities' from taxonomy_after) then
    raise exception 'Geography update changed unrelated country, history or place data; rolling back.';
  end if;
  if (select jsonb_agg(case when value->>'id' in (select id from taxonomy_changed)
      then value-'continent'-'region'-'subregion'-'updated_at' else value end order by value->>'id')
      from taxonomy_before,jsonb_array_elements(data->'cities'))
    is distinct from
    (select jsonb_agg(case when value->>'id' in (select id from taxonomy_changed)
      then value-'continent'-'region'-'subregion'-'updated_at' else value end order by value->>'id')
      from taxonomy_after,jsonb_array_elements(data->'cities')) then
    raise exception 'Geography update changed unrelated city data; rolling back.';
  end if;
end $taxonomy_verify$;
commit;
`;
  return {
    sql,
    changes,
    cityCount: snapshot.cities.length,
    countryCount: reference.length,
  };
}

async function main() {
  const apply = process.argv.includes("--apply");
  const dryRun = process.argv.includes("--dry-run");
  if (apply && dryRun) throw new Error("Choose apply or dry-run, not both.");
  const { projectRef } = JSON.parse(
    readFileSync(".cache/cloud-setup.json", "utf8"),
  );
  if (!/^[a-z0-9]{20}$/.test(projectRef) || !process.env.SUPABASE_ACCESS_TOKEN)
    throw new Error(
      "Configured Supabase project and management credential are required.",
    );
  const query = async (sql: string) => {
    const response = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
        signal: AbortSignal.timeout(30000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Geography database request failed (${response.status}); no further changes attempted.`,
      );
    return response.json();
  };
  const reference = importCountryGeography(
    readFileSync("data/reference/country-geography.csv", "utf8"),
    countryCollection(),
  );
  const identities = collectionRows();
  const before = (await query(geographySnapshotQuery))[0]
    .snapshot as GeographySnapshot;
  const plan = countryGeographySyncPlan(before, reference, identities);
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/country-geography-ready.sql", plan.sql);
  if (apply || dryRun)
    await query(
      dryRun ? plan.sql.replace(/commit;\s*$/i, "rollback;") : plan.sql,
    );
  const after =
    apply || dryRun
      ? ((await query(geographySnapshotQuery))[0].snapshot as GeographySnapshot)
      : before;
  if (dryRun && !isDeepStrictEqual(before, after))
    throw new Error(
      "Collection changed during the dry run; review a fresh snapshot.",
    );
  const remaining = countryGeographySyncPlan(after, reference, identities)
    .changes.length;
  if (apply && remaining)
    throw new Error("Live geography verification found remaining differences.");
  const report = {
    mode: apply ? "applied" : dryRun ? "dry-run-rolled-back" : "read-only-plan",
    cities: plan.cityCount,
    reviewedCountries: plan.countryCount,
    changedCities: plan.changes.length,
    remainingChanges: remaining,
    changes: plan.changes,
    protectedTables: Object.keys(TABLE_KEYS),
    preserved:
      "All history, non-geography city fields, countries, places and relationships",
  };
  writeFileSync(
    ".cache/country-geography-report.json",
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify({ ...report, changes: undefined }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  await main();
