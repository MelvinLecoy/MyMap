import test from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  loadCollectionPart,
  invalidateCollectionReads,
  readCollectionSnapshot,
  type CollectionSnapshot,
} from "../src/lib/collection-snapshot";

function fixture(): CollectionSnapshot {
  return {
    version: 1,
    cities: {
      cities: [
        {
          id: "paris-france",
          name: "Paris",
          country: "France",
          country_code: "FR",
          continent: "Europe",
          region: "",
          subregion: "",
          longitude: 2.35,
          latitude: 48.85,
          map_embed_url: null,
          map_viewer_url: null,
          map_status: "Complete",
          visit_status: "not-visited",
          last_visited: null,
          notes: "",
          pin_color: null,
          updated_at: "2026-11-16T00:00:00Z",
        },
      ],
      visits: [],
      periods: [],
    },
    countries: {
      countries: [
        {
          code: "FR",
          name: "France",
          continent: "Europe",
          is_195: true,
          visit_status: "not-visited",
          first_visit_order: null,
          times_visited: null,
          total_days_spent: null,
          visit_history_complete: false,
          notes: "",
          aliases: [],
        },
      ],
      visits: [],
      periods: [],
    },
    places: [],
  };
}
type Result = {
  data: unknown;
  error: null | { code: string; message: string };
};
function clientWith(handler: (name: string) => Promise<Result> | Result) {
  const calls: string[] = [];
  return {
    client: {
      rpc(name: string) {
        calls.push(name);
        return handler(name);
      },
    } as unknown as SupabaseClient,
    calls,
  };
}

test("concurrent collection readers share one database statement without caching later reads", async () => {
  let finish!: (result: Result) => void;
  const pending = new Promise<Result>((resolve) => (finish = resolve));
  let response = pending;
  const { client, calls } = clientWith(() => response);
  const city = loadCollectionPart(client, "cities");
  const countries = loadCollectionPart(client, "countries");
  const places = loadCollectionPart(client, "places");
  assert.deepEqual(calls, ["atlas_collection_snapshot"]);
  const snapshot = fixture();
  finish({ data: snapshot, error: null });
  assert.deepEqual(await Promise.all([city, countries, places]), [
    snapshot.cities,
    snapshot.countries,
    snapshot.places,
  ]);
  response = Promise.resolve({ data: structuredClone(snapshot), error: null });
  assert.equal(await loadCollectionPart(client, "cities"), await city);
  assert.equal(calls.length, 2, "a later read must still query the database");
});

test("unchanged snapshots retain references but confirmed revisions and edits are observable", async () => {
  const snapshot = fixture();
  const { client } = clientWith(() => ({
    data: structuredClone(snapshot),
    error: null,
  }));
  const before = await loadCollectionPart(client, "cities");
  const countriesBefore = await loadCollectionPart(client, "countries");
  assert.equal(await loadCollectionPart(client, "cities"), before);
  snapshot.cities.cities[0].updated_at = "2026-11-16T00:00:01Z";
  const revision = await loadCollectionPart(client, "cities");
  assert.notEqual(revision, before);
  assert.equal(revision.cities[0].updated_at, "2026-11-16T00:00:01Z");
  snapshot.cities.cities[0].map_status = "Update";
  const edited = await loadCollectionPart(client, "cities");
  assert.notEqual(edited, revision);
  assert.equal(edited.cities[0].map_status, "Update");
  assert.equal(await loadCollectionPart(client, "countries"), countriesBefore);
});

test("only a missing combined RPC falls back to independently requested legacy endpoints", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const snapshot = fixture();
    const { client, calls } = clientWith((name) => ({
      data:
        name === "atlas_city_snapshot"
          ? snapshot.cities
          : name === "atlas_country_snapshot"
            ? snapshot.countries
            : null,
      error:
        name === "atlas_collection_snapshot"
          ? { code, message: "Missing function" }
          : null,
    }));
    const [cities, countries] = await Promise.all([
      loadCollectionPart(client, "cities"),
      loadCollectionPart(client, "countries"),
    ]);
    assert.deepEqual(cities, snapshot.cities);
    assert.deepEqual(countries, snapshot.countries);
    assert.deepEqual(calls, [
      "atlas_collection_snapshot",
      "atlas_city_snapshot",
      "atlas_country_snapshot",
    ]);
  }
});

test("authorization and network failures never hide behind legacy reads and retries stay fresh", async () => {
  for (const code of ["42501", "PGRST301", "503", ""]) {
    let fail = true;
    const error = { code, message: "Unavailable" };
    const { client, calls } = clientWith(() => ({
      data: fail ? null : fixture(),
      error: fail ? error : null,
    }));
    await assert.rejects(loadCollectionPart(client, "cities"), error);
    assert.deepEqual(calls, ["atlas_collection_snapshot"]);
    fail = false;
    assert.deepEqual(
      await loadCollectionPart(client, "cities"),
      fixture().cities,
    );
  }
});

test("malformed versions, histories and relationships reject the whole combined snapshot", async () => {
  const invalid = [
    { ...fixture(), version: 2 },
    { ...fixture(), countries: null },
    { ...fixture(), places: null },
    {
      ...fixture(),
      cities: { ...fixture().cities, visits: [{ city_id: "missing" }] },
    },
    {
      ...fixture(),
      cities: {
        ...fixture().cities,
        cities: [{ ...fixture().cities.cities[0], country_code: "GB" }],
      },
    },
  ];
  for (const data of invalid) {
    assert.throws(() => readCollectionSnapshot(data));
    const { client, calls } = clientWith(() => ({ data, error: null }));
    await assert.rejects(loadCollectionPart(client, "places"));
    assert.deepEqual(calls, ["atlas_collection_snapshot"]);
  }
});

test("different database clients never share requests or previously validated values", async () => {
  const first = clientWith(() => ({ data: fixture(), error: null }));
  const other = fixture();
  other.cities.cities[0].map_status = "Not Started";
  const second = clientWith(() => ({ data: other, error: null }));
  const [a, b] = await Promise.all([
    loadCollectionPart(first.client, "cities"),
    loadCollectionPart(second.client, "cities"),
  ]);
  assert.equal(a.cities[0].map_status, "Complete");
  assert.equal(b.cities[0].map_status, "Not Started");
  assert.equal(first.calls.length, 1);
  assert.equal(second.calls.length, 1);
});

test("a write barrier prevents post-save reads joining another hook's earlier request", async () => {
  let finishOld!: (result: Result) => void;
  const oldRead = new Promise<Result>((resolve) => (finishOld = resolve));
  const current = fixture();
  current.cities.cities[0].map_status = "Update";
  current.cities.cities[0].updated_at = "2026-11-16T00:00:01Z";
  let first = true;
  const { client, calls } = clientWith(() => {
    if (first) {
      first = false;
      return oldRead;
    }
    return { data: structuredClone(current), error: null };
  });
  const beforeWrite = loadCollectionPart(client, "cities");
  invalidateCollectionReads(client);
  const afterWrite = await loadCollectionPart(client, "cities");
  assert.equal(afterWrite.cities[0].map_status, "Update");
  assert.equal(calls.length, 2);
  finishOld({ data: fixture(), error: null });
  assert.equal((await beforeWrite).cities[0].map_status, "Complete");
  assert.equal(await loadCollectionPart(client, "cities"), afterWrite);
  assert.equal(
    calls.length,
    3,
    "completion of the old read cannot poison the new reader",
  );
});
