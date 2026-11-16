import { readCollectionCsv } from "./collection-inputs";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { importPlaces } from "./place-importer";
import { importCountryHistory } from "./country-importer";
import starter from "../data/countries.sample.json";
import { fromPlaceRow, type PlaceRow } from "../src/lib/places";
import type { Place } from "../src/lib/types";

const countries = importCountryHistory(
  readCollectionCsv("data/countries.csv"),
  readCollectionCsv("data/country-visit-history.csv"),
  starter.countries,
  readFileSync("data/country-visit-periods.csv", "utf8"),
);
export const approvedPlaces = importPlaces(
  readFileSync("data/places.csv", "utf8"),
  readFileSync("data/place-countries.csv", "utf8"),
  countries,
);
const quote = (value: unknown) =>
  value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const referenceColumns = [
  "name",
  "continent",
  "region",
  "subregion",
  "longitude",
  "latitude",
  "outline",
  "outline_source",
];

/** Compare repository-owned place data separately from saved collection state. */
export function placeReferenceData(place: Place) {
  return {
    id: place.id,
    name: place.name,
    continent: place.continent,
    region: place.region,
    subregion: place.subregion,
    coordinates: place.coordinates,
    countries: place.countries,
    outline: place.outline,
    outlineSource: place.outlineSource,
  };
}

/** Seed initial state once; subsequent imports only refresh reference metadata. */
export function placeSeedSql(places: Place[] = approvedPlaces) {
  return places
    .map((place) => {
      const columns = [
        "id",
        "name",
        "continent",
        "region",
        "subregion",
        "longitude",
        "latitude",
        "map_embed_url",
        "map_viewer_url",
        "map_status",
        "visit_status",
        "last_visited",
        "notes",
        "pin_color",
        "outline",
        "outline_source",
      ];
      const values = [
        place.id,
        place.name,
        place.continent,
        place.region,
        place.subregion,
        place.coordinates![0],
        place.coordinates![1],
        place.map?.embedUrl,
        place.map?.viewerUrl,
        place.status,
        place.visit,
        place.lastVisited,
        place.notes,
        place.pinColor,
        place.outline ? JSON.stringify(place.outline) : null,
        place.outlineSource,
      ];
      return (
        `insert into public.places (${columns.join(",")}) select ${values.map(quote).join(",")} where not exists(select 1 from public.places where id=${quote(place.id)});
update public.places t set ${referenceColumns.map((column) => `${column}=${quote(values[columns.indexOf(column)])}${column === "outline" ? "::jsonb" : column === "longitude" || column === "latitude" ? "::double precision" : ""}`).join(",")}
where t.id=${quote(place.id)} and row(${referenceColumns.map((c) => `t.${c}`).join(",")}) is distinct from row(${referenceColumns.map((column) => `${quote(values[columns.indexOf(column)])}${column === "outline" ? "::jsonb" : column === "longitude" || column === "latitude" ? "::double precision" : ""}`).join(",")});
delete from public.place_countries where place_id=${quote(place.id)};\n` +
        place.countries
          .map(
            (country, i) =>
              `insert into public.place_countries(place_id,country_code,position) values (${quote(place.id)},${quote(country.code)},${i + 1});`,
          )
          .join("\n")
      );
    })
    .join("\n");
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const migration = readFileSync(
    "supabase/migrations/202611150001_places.sql",
    "utf8",
  );
  const schema = migration
    .replace(/^\s*begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  const sql = `begin;do $schema$ begin if to_regclass('atlas_data.places') is null then execute $legacy$${schema}$legacy$;end if;end $schema$;\n${placeSeedSql()}\ncommit;`;
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/places-ready.sql", sql);
  const apply = process.argv.includes("--apply"),
    verify = process.argv.includes("--verify"),
    dryRun = process.argv.includes("--dry-run");
  if ([apply, verify, dryRun].filter(Boolean).length > 1)
    throw new Error("Choose apply, verify or dry-run.");
  if (apply || verify || dryRun) {
    const { projectRef } = JSON.parse(
      readFileSync(".cache/cloud-setup.json", "utf8"),
    );
    if (
      !/^[a-z0-9]{20}$/.test(projectRef) ||
      !process.env.SUPABASE_ACCESS_TOKEN
    )
      throw new Error(
        "Configured Supabase project and management credential are required.",
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
        },
      );
      if (!response.ok)
        throw new Error(
          `Place persistence failed (${response.status}): ${await response.text()}`,
        );
      return response.json();
    }
    if (apply || dryRun)
      await query(dryRun ? sql.replace(/commit;\s*$/i, "rollback;") : sql);
    if (!dryRun) {
      const result = await query(
        "select public.atlas_places_snapshot() as places;",
      );
      const actual = (result[0].places as PlaceRow[]).map(fromPlaceRow);
      if (
        !isDeepStrictEqual(
          actual.map(placeReferenceData),
          approvedPlaces.map(placeReferenceData),
        )
      )
        throw new Error(
          "Place reference CSVs, boundaries and database do not match.",
        );
      if (verify && !isDeepStrictEqual(actual, approvedPlaces))
        throw new Error(
          "Saved place state differs from its repository snapshot. The database edits were preserved; review them before a future repository checkpoint.",
        );
    }
    console.log(
      dryRun
        ? "Place migration and approved batch verified and rolled back."
        : apply
          ? `${approvedPlaces.length} place: reference data refreshed; saved editable state preserved.`
          : `${approvedPlaces.length} place: CSVs, outline and database match.`,
    );
  } else
    console.log(
      `Prepared ${approvedPlaces.length} place in .cache/places-ready.sql; no live changes.`,
    );
}
