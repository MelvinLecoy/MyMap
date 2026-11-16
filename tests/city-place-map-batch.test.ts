import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import type { Map as MapInstance } from "maplibre-gl";
import {
  cityPlaceMapBatchSql,
  mapBatch,
} from "../scripts/city-place-map-batch";
import { collectionRows, seedSql } from "../scripts/supabase-data";
import { countryCollection, countrySeedSql } from "../scripts/country-database";
import { cityCollection, citySeedSql } from "../scripts/city-database";
import { placeSeedSql, approvedPlaces } from "../scripts/sync-places";
import { backendArchitectureSql } from "../scripts/backend-architecture";
import { conciseStorageSql } from "../scripts/concise-storage";
import { toCountrySnapshot } from "../src/lib/country-cloud-data";
import { verifyData, type PersistentData } from "../scripts/data-integrity";
import {
  fromPlaceRow,
  placeBounds,
  placeOutlineFeatures,
  placePinFeatures,
  outlineContains,
  type PlaceRow,
} from "../src/lib/places";
import { focusPlace } from "../src/lib/place-selection";

test("all approved city/place rows have maps and pins; all eleven places have sourced outlines", () => {
  assert.equal(mapBatch.cities.length, 21);
  assert.equal(
    mapBatch.cityEntries.filter((entry) => !entry.existing).length,
    18,
  );
  assert.equal(mapBatch.places.length, 11);
  for (const city of mapBatch.cities) {
    const existing = mapBatch.cityEntries.find(
      (entry) => entry.id === city.id,
    )!.existing;
    assert.equal(
      city.visit_status,
      existing ? "visited" : "not-visited",
      city.id,
    );
  }
  for (const city of mapBatch.cities) {
    assert.ok(city.latitude !== null && city.longitude !== null, city.id);
    assert.ok(city.map_embed_url?.includes("&ehbc=2E312F"), city.id);
  }
  assert.equal(placePinFeatures(approvedPlaces).features.length, 11);
  assert.equal(placeOutlineFeatures(approvedPlaces).features.length, 11);
  assert.deepEqual(
    approvedPlaces.filter((place) => !place.outline).map((place) => place.name),
    [],
  );
  const fuji = approvedPlaces.find((place) => place.id === "fuji")!;
  assert.ok(placeBounds(fuji));
  const withoutOutline = { ...fuji, outline: null };
  assert.equal(placeBounds(withoutOutline), null);
  let camera: unknown;
  focusPlace(
    {
      flyTo: (options: unknown) => {
        camera = options;
      },
    } as MapInstance,
    withoutOutline,
    0,
  );
  assert.deepEqual(camera, {
    center: fuji.coordinates,
    zoom: 5,
    duration: 0,
    essential: false,
  });
  assert.ok(
    mapBatch.places.every(
      (place) =>
        place.visit === "unknown" &&
        !place.lastVisited &&
        !place.visits?.length,
    ),
  );
  assert.ok(
    !mapBatch.cities.some((city) => city.id === "interlaken-switzerland"),
  );
});

test("reviewed batch rehearses and repeats atomically while preserving countries, all stays and unrelated saved edits", async () => {
  const db = new PGlite();
  const newIds = new Set(
    mapBatch.cityEntries
      .filter((entry) => !entry.existing)
      .map((entry) => entry.id),
  );
  const beforeCities = collectionRows()
    .filter((city) => !newIds.has(city.id))
    .map((city) => {
      const entry = mapBatch.cityEntries.find((entry) => entry.id === city.id);
      return entry?.existing
        ? {
            ...city,
            map_status: "Not Started" as const,
            map_embed_url: null,
            map_viewer_url: null,
          }
        : city;
    });
  const patagonia = approvedPlaces.find((place) => place.id === "patagonia")!;
  const load = async () =>
    (
      await db.query<{ data: PersistentData & { places: PlaceRow[] } }>(
        "select public.atlas_collection_snapshot() as data",
      )
    ).rows[0].data;
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;`,
    );
    for (const file of [
      "202611120001_atlas.sql",
      "202611130001_country_history.sql",
      "202611130002_city_history.sql",
      "202611130003_country_half_days.sql",
      "202611140002_city_visit_periods.sql",
      "202611150001_places.sql",
    ])
      await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
    await db.exec(
      `begin;${countrySeedSql(toCountrySnapshot(countryCollection()))}${seedSql(beforeCities)}${citySeedSql(cityCollection().filter((city) => !newIds.has(city.id)))}${placeSeedSql([{ ...patagonia, status: "Not Started", map: null }])}commit;`,
    );
    await db.exec(backendArchitectureSql().sql);
    await db.exec(conciseStorageSql().sql);
    await db.exec(
      "update public.cities set notes='Preserve this online note' where id='london-uk'",
    );
    const before = await load();
    await db.exec(cityPlaceMapBatchSql(true));
    assert.deepEqual(
      await load(),
      before,
      "Live rehearsal rolls back schema, data and revisions",
    );
    await db.exec(cityPlaceMapBatchSql());
    let after = await load();
    assert.deepEqual(after.countries, before.countries);
    assert.deepEqual(after.cities.visits, before.cities.visits);
    assert.deepEqual(after.cities.periods, before.cities.periods);
    assert.equal(
      after.cities.cities.find((city) => city.id === "london-uk")!.notes,
      "Preserve this online note",
    );
    const expectedWithNote = structuredClone(after);
    expectedWithNote.cities.cities.find(
      (city) => city.id === "london-uk",
    )!.notes = "";
    assert.deepEqual(verifyData(expectedWithNote).issues, []);
    assert.equal(after.places.length, 11);
    assert.equal(
      after.places.filter((place) => fromPlaceRow(place).outline === null)
        .length,
      0,
    );
    // Upgrade the original import's unknown flags using the owner's later verdict.
    await db.exec(
      `update public.cities set visit_status='unknown' where id in (${[...newIds].map((id) => `'${id}'`).join(",")});`,
    );
    await db.exec(cityPlaceMapBatchSql());
    const corrected = await load();
    for (const city of corrected.cities.cities.filter((city) =>
      newIds.has(city.id),
    ))
      assert.equal(city.visit_status, "not-visited", city.id);
    assert.deepEqual(corrected.cities.visits, after.cities.visits);
    assert.deepEqual(corrected.cities.periods, after.cities.periods);
    assert.deepEqual(corrected.places, after.places);
    after = corrected;
    await db.exec(cityPlaceMapBatchSql());
    assert.deepEqual(
      await load(),
      after,
      "Repeated batch preserves exact revision timestamps",
    );
    await db.exec(
      "update public.cities set map_status='Complete' where id='austin-usa'",
    );
    const edited = await load();
    await assert.rejects(
      db.exec(cityPlaceMapBatchSql()),
      /Unexpected saved state/,
    );
    await db.exec("rollback");
    assert.deepEqual(
      await load(),
      edited,
      "A conflicting saved edit rejects the whole import",
    );
  } finally {
    await db.close();
  }
});

test("completed outlines retain the requested landmarks and exclude unrelated regions", () => {
  const cases = {
    fuji: {
      inside: [
        [138.7274, 35.3606],
        [138.586, 35.464],
        [138.609, 35.491],
        [138.686, 35.498],
        [138.753, 35.514],
        [138.873, 35.413],
        [138.73, 35.29],
      ],
      outside: [
        [139.01, 35.21],
        [138.67, 35.16],
      ],
    },
    izu: {
      inside: [
        [138.95, 34.703],
        [138.86, 35.12],
        [138.84, 34.63],
        [139.07, 35.1],
        [138.942, 34.918],
      ],
      outside: [
        [138.7274, 35.3606],
        [139.39, 34.75],
        [139.76, 35.68],
      ],
    },
    "torres-del-paine": {
      inside: [
        [-73.05, -51.05],
        [-72.991, -50.942],
        [-73.113, -51.124],
      ],
      outside: [
        [-72.50603, -51.72987],
        [-72.8, -51.5],
      ],
    },
    "lake-atitlan": {
      inside: [
        [-91.189, 14.69],
        [-91.16, 14.73],
        [-91.245, 14.703],
      ],
      outside: [
        [-91.287, 14.696],
        [-91.186, 14.582],
        [-91.184, 14.773],
      ],
    },
    atacama: {
      inside: [
        [-68.20113, -22.9111],
        [-68.25, -23.5],
        [-68.004, -23.189],
        [-67.891, -23.588],
      ],
      outside: [
        [-68.93, -22.45],
        [-69.2, -27.3],
      ],
    },
  };
  const sources = JSON.parse(
    readFileSync(
      "data/sources/place-outline-completion-2026-11-16.json",
      "utf8",
    ),
  ) as { placeId: string; geometrySha256: string }[];
  for (const [id, points] of Object.entries(cases)) {
    const place = approvedPlaces.find((place) => place.id === id)!;
    assert.ok(place.outline);
    assert.equal(
      outlineContains(place.outline, place.coordinates!),
      true,
      id + " pin",
    );
    for (const point of points.inside)
      assert.equal(
        outlineContains(place.outline, point),
        true,
        id + " inside " + point.join(","),
      );
    for (const point of points.outside)
      assert.equal(
        outlineContains(place.outline, point),
        false,
        id + " outside " + point.join(","),
      );
    assert.equal(
      createHash("sha256").update(JSON.stringify(place.outline)).digest("hex"),
      sources.find((source) => source.placeId === id)!.geometrySha256,
    );
  }
});

test("Cappadocia follows the broad four-province scope and Komodo excludes the wider national park", () => {
  const cappadocia = approvedPlaces.find((place) => place.id === "cappadocia")!;
  for (const point of [
    [34.7122, 38.625],
    [34.0254, 38.3687],
    [34.679, 37.9667],
    [35.4853, 38.7322],
  ])
    assert.equal(
      outlineContains(cappadocia.outline!, point),
      true,
      point.join(","),
    );
  for (const point of [
    [32.4846, 37.8714],
    [34.1632, 39.1458],
    [35.33, 37.0],
  ])
    assert.equal(
      outlineContains(cappadocia.outline!, point),
      false,
      point.join(","),
    );
  const komodo = approvedPlaces.find((place) => place.id === "komodo")!;
  assert.equal(outlineContains(komodo.outline!, komodo.coordinates!), true);
  assert.equal(outlineContains(komodo.outline!, [119.7, -8.7]), false);
  assert.equal(outlineContains(komodo.outline!, [119.886, -8.5]), false);
});
