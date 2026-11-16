import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { readCSV, parseMapLink } from "./importer";
import { collectionRows, seedSql } from "./supabase-data";
import { approvedPlaces, placeSeedSql } from "./sync-places";
import { fromPlaceRow, type PlaceRow } from "../src/lib/places";
import { toCityRow, type CityRow } from "../src/lib/cloud-data";
import { verifyData, type PersistentData } from "./data-integrity";

export const MAP_BATCH_SOURCE =
  "data/sources/city-place-map-additions-2026-11-16";
interface Entry {
  id: string;
  name: string;
  existing: boolean;
  previousMapStatus?: string;
  previousMapUrl?: string | null;
}
const ledger = JSON.parse(readFileSync(MAP_BATCH_SOURCE + ".json", "utf8")) as {
  cities: Entry[];
  places: Entry[];
};
const status = { Complete: "Complete", Usable: "Update", Update: "Unfinished" };
export const mapBatch = (() => {
  const cities = collectionRows();
  const found = new Set<string>();
  for (const { values: row, line } of readCSV(
    readFileSync(MAP_BATCH_SOURCE + ".csv", "utf8"),
    ["Nature", "Name", "Country", "Status", "Link"],
  )) {
    if (row.nature === "Country" || row.name === "Interlaken") continue;
    if (row.nature !== "City" && row.nature !== "Place")
      throw new Error(`Unsupported Nature at row ${line}.`);
    const inventory = row.nature === "City" ? ledger.cities : ledger.places;
    const entry = inventory.find((entry) => entry.name === row.name);
    if (!entry || found.has(entry.id))
      throw new Error(
        `Missing or duplicate reviewed inventory at row ${line}.`,
      );
    found.add(entry.id);
    const target =
      row.nature === "City"
        ? cities.find((city) => city.id === entry.id)
        : approvedPlaces.find((place) => place.id === entry.id);
    const projected =
      target &&
      (row.nature === "City"
        ? (target as CityRow)
        : toCityRow(target as (typeof approvedPlaces)[number]));
    const map = parseMapLink(row.link);
    if (
      !projected ||
      !map ||
      projected.map_embed_url !== map.embedUrl ||
      projected.map_viewer_url !== map.viewerUrl ||
      projected.map_status !== status[row.status as keyof typeof status]
    )
      throw new Error(
        `Canonical record does not reproduce the approved map/status at row ${line}.`,
      );
  }
  if (found.size !== ledger.cities.length + ledger.places.length)
    throw new Error("Approved inventory contains unmatched records.");
  return {
    cities: cities.filter((city) =>
      ledger.cities.some((entry) => entry.id === city.id),
    ),
    places: approvedPlaces.filter((place) =>
      ledger.places.some((entry) => entry.id === place.id),
    ),
    cityEntries: ledger.cities,
    placeEntries: ledger.places,
  };
})();
const q = (value: unknown) =>
  value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const j = (value: unknown) => q(JSON.stringify(value)) + "::jsonb";
const ids = (entries: Entry[]) =>
  `array[${entries.map((entry) => q(entry.id)).join(",")}]::text[]`;
const migration = readFileSync(
  "supabase/migrations/202611160003_optional_place_outlines.sql",
  "utf8",
);
const version = "202611160003";
const checksum = createHash("sha256").update(migration).digest("hex");

/** Only this reviewed batch's map fields may change on pre-existing records. */
export function cityPlaceMapBatchSql(rollback = false) {
  const groups = [
    { table: "cities", entries: mapBatch.cityEntries, rows: mapBatch.cities },
    {
      table: "places",
      entries: mapBatch.placeEntries,
      rows: mapBatch.places.map(toCityRow),
    },
  ];
  const guardedUpdates = groups
    .map(({ table, entries, rows }) =>
      entries
        .filter((entry) => entry.existing)
        .map((entry) => {
          const wanted = rows.find((row) => row.id === entry.id)!;
          return `do $guard$ begin
 if not exists(select 1 from public.${table} where id=${q(entry.id)} and
   ((map_embed_url is not distinct from ${q(entry.previousMapUrl)} and map_status=${q(entry.previousMapStatus)})
     or (map_embed_url=${q(wanted.map_embed_url)} and map_viewer_url=${q(wanted.map_viewer_url)} and map_status=${q(wanted.map_status)})))
 then raise exception 'Unexpected saved state for approved ${table} record ${entry.id}; review before importing.';end if;
end $guard$;
update public.${table} set map_embed_url=${q(wanted.map_embed_url)},map_viewer_url=${q(wanted.map_viewer_url)},map_status=${q(wanted.map_status)}
where id=${q(entry.id)} and row(map_embed_url,map_viewer_url,map_status) is distinct from row(${q(wanted.map_embed_url)},${q(wanted.map_viewer_url)},${q(wanted.map_status)});`;
        })
        .join("\n"),
    )
    .join("\n");
  const newCities = mapBatch.cities.filter(
    (city) => !ledger.cities.find((entry) => entry.id === city.id)!.existing,
  );
  const newPlaces = mapBatch.places.filter(
    (place) => !ledger.places.find((entry) => entry.id === place.id)!.existing,
  );
  const confirmedNotVisited = newCities.filter((city) => city.visit_status === "not-visited");
  const confirmedIds = `array[${confirmedNotVisited.map((city) => q(city.id)).join(",")}]::text[]`;
  const expectedPlaces = mapBatch.places.map((place) => {
    const { country: _country, country_code: _code, ...row } = toCityRow(place);
    return {
      ...row,
      countries: place.countries,
      outline: place.outline,
      outline_source: place.outlineSource,
    };
  });
  const checkExpected = (table: "cities" | "places", expected: object[]) => `
 if exists(select 1 from jsonb_array_elements(${j(expected)}) s where
   not exists(select 1 from ${table === "cities" ? "public.cities" : "jsonb_array_elements(public.atlas_places_snapshot())"} t
     where ${table === "cities" ? "to_jsonb(t)-'created_at'-'updated_at'" : "t-'created_at'-'updated_at'"}=s))
 then raise exception 'Approved ${table} do not exactly match the canonical source.';end if;`;
  const preserve = (
    table: "cities" | "places",
    existing: Entry[],
    newEntries: Entry[],
  ) => {
    const relation =
      table === "cities"
        ? "select to_jsonb(c) as value from public.cities c"
        : "select value from jsonb_array_elements(public.atlas_places_snapshot())";
    const project = (json: string) =>
      `(select coalesce(jsonb_agg(case when value->>'id'=any(${ids(existing)}) then value-'updated_at'-'map_embed_url'-'map_viewer_url'-'map_status' else value end order by value->>'id'),'[]'::jsonb) from ${json} where not(value->>'id'=any(${ids(newEntries)})))`;
    return `if ${project(`(${relation}) snapshot`)} is distinct from ${project(`jsonb_array_elements((select ${table} from _map_batch_before))`)} then raise exception 'Unapproved changes to existing ${table}.';end if;`;
  };
  return `begin isolation level serializable;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(202611160003);
lock table atlas_data.cities,atlas_data.countries,atlas_data.city_visits,atlas_data.city_visit_periods,atlas_data.country_visits,atlas_data.country_visit_periods,atlas_data.places,atlas_data.place_countries in share row exclusive mode;
create temp table _map_batch_before on commit drop as select
 public.atlas_city_snapshot() as city_history,public.atlas_country_snapshot() as countries,
 (select jsonb_agg(to_jsonb(c) order by id) from public.cities c) as cities,
 public.atlas_places_snapshot() as places,
 (select jsonb_agg(to_jsonb(p) order by place_id,position) from public.place_countries p) as memberships;
do $checksum$ begin
 if exists(select 1 from atlas_private.schema_migrations where version=${q(version)} and checksum<>${q(checksum)})
 then raise exception 'Applied optional outline migration checksum changed.';end if;
end $checksum$;
${migration.replace(/^\s*begin;\s*/i, "").replace(/commit;\s*$/i, "")}
insert into atlas_private.schema_migrations(version,checksum) values(${q(version)},${q(checksum)}) on conflict(version) do nothing;
${guardedUpdates}
${seedSql(newCities)}
-- The owner confirmed only the three existing cities in this sheet were visited.
-- Reconcile the original unknown flags without resetting a recorded/planned visit.
do $visit_flags$ begin
 if exists(select 1 from public.cities c where id=any(${confirmedIds}) and
  (visit_status not in ('unknown','not-visited') or last_visited is not null
   or exists(select 1 from public.city_visits v where v.city_id=c.id)))
 then raise exception 'Confirmed unvisited city has a conflicting saved visit; review before importing.';end if;
end $visit_flags$;
update public.cities set visit_status='not-visited'
 where id=any(${confirmedIds}) and visit_status='unknown';
${placeSeedSql(newPlaces)}
do $verify$ begin
 if public.atlas_country_snapshot() is distinct from (select countries from _map_batch_before)
 or public.atlas_city_snapshot()->'visits' is distinct from (select city_history->'visits' from _map_batch_before)
 or public.atlas_city_snapshot()->'periods' is distinct from (select city_history->'periods' from _map_batch_before)
 then raise exception 'Country data or city visit history changed during a map-only import.';end if;
 ${preserve(
   "cities",
   ledger.cities.filter((entry) => entry.existing),
   ledger.cities.filter((entry) => !entry.existing),
 )}
 ${preserve(
   "places",
   ledger.places.filter((entry) => entry.existing),
   ledger.places.filter((entry) => !entry.existing),
 )}
 if (select jsonb_agg(to_jsonb(p) order by place_id,position) from public.place_countries p where not(place_id=any(${ids(ledger.places.filter((entry) => !entry.existing))})))
 is distinct from (select jsonb_agg(value order by value->>'place_id',(value->>'position')::integer) from jsonb_array_elements((select memberships from _map_batch_before)) where not(value->>'place_id'=any(${ids(ledger.places.filter((entry) => !entry.existing))}))) then raise exception 'Existing place country memberships changed.';end if;
 ${checkExpected("cities", mapBatch.cities)}
 ${checkExpected("places", expectedPlaces)}
end $verify$;
${rollback ? "rollback" : "commit"};`;
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const modes = ["--apply", "--dry-run", "--verify"].filter((flag) =>
    process.argv.includes(flag),
  );
  if (modes.length > 1)
    throw new Error("Choose one of apply, dry-run or verify.");
  mkdirSync(".cache/new-map-data", { recursive: true });
  writeFileSync(
    ".cache/new-map-data/approved-batch.sql",
    cityPlaceMapBatchSql(),
  );
  if (!modes.length)
    console.log("Prepared reviewed city/place map batch; no live changes.");
  else {
    const { projectRef } = JSON.parse(
      readFileSync(".cache/cloud-setup.json", "utf8"),
    );
    if (
      !/^[a-z0-9]{20}$/.test(projectRef) ||
      !process.env.SUPABASE_ACCESS_TOKEN
    )
      throw new Error(
        "Configured project and management credential are required.",
      );
    async function query(query: string) {
      const response = await fetch(
        `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query }),
          signal: AbortSignal.timeout(60000),
        },
      );
      if (!response.ok)
        throw new Error(
          `Map batch failed (${response.status}): ${await response.text()}`,
        );
      return response.json();
    }
    if (!process.argv.includes("--verify"))
      await query(cityPlaceMapBatchSql(process.argv.includes("--dry-run")));
    if (!process.argv.includes("--dry-run")) {
      const [{ cities, countries, places }] = (await query(
        "select public.atlas_city_snapshot() as cities,public.atlas_country_snapshot() as countries,public.atlas_places_snapshot() as places;",
      )) as (PersistentData & { places: PlaceRow[] })[];
      const report = verifyData({ cities, countries });
      const sort = <T extends { id: string }>(rows: T[]) =>
        [...rows].sort((a, b) => a.id.localeCompare(b.id));
      if (
        !report.matches ||
        !isDeepStrictEqual(sort(places.map(fromPlaceRow)), sort(approvedPlaces))
      )
        throw new Error(
          "Saved collection does not match the reviewed city/place sources: " +
            report.issues.join("; "),
        );
      console.log(
        JSON.stringify({
          ...report.counts,
          places: places.length,
          outlinedPlaces: places.filter((p) => p.outline !== null).length,
          pendingPlaceOutlines: places
            .filter((p) => p.outline === null)
            .map((p) => p.name),
        }),
      );
    } else
      console.log(
        "City/place batch verified against the live database and rolled back; country and visit history preserved.",
      );
  }
}
