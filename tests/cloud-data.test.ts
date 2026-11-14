import test from "node:test";
import assert from "node:assert/strict";
import { collectionRows } from "../scripts/supabase-data.js";
import {
  fromCityRow,
  toCityRow,
  exportCitiesCsv,
  deriveCountries,
} from "../src/lib/cloud-data.js";
import { readCloudConfig } from "../src/lib/cloud-config.js";
import { importCities } from "../scripts/importer.js";

test("the database collection and CSV exports preserve IDs, links, statuses and missing positions", () => {
  const rows = collectionRows();
  const cities = rows.map(fromCityRow);
  assert.equal(cities.length, 325);
  assert.equal(cities.filter((c) => c.coordinates).length, 323);
  assert.deepEqual(cities.map(toCityRow), rows);
  const edited = cities.find((c) => c.id === "moscow-russia")!;
  edited.status = "Update";
  edited.visit = "visited";
  edited.lastVisited = "2025";
  edited.notes = 'A note, with "quotes"\nand a new line.';
  const result = importCities(exportCitiesCsv(cities)).data;
  assert.deepEqual(result.cities, cities);
  assert.equal(deriveCountries(cities, []).filter((c) => c.visited).length, 40);
  assert.equal(cities.find((c) => c.name === "Iguazu")?.coordinates, null);
});

test("only public keys can be bundled and incomplete cloud configuration fails clearly", () => {
  assert.equal(readCloudConfig(undefined, undefined), null);
  assert.throws(
    () => readCloudConfig("https://project.supabase.co", undefined),
    /both/,
  );
  assert.throws(
    () =>
      readCloudConfig("http://project.supabase.co", "sb_publishable_example"),
    /HTTPS/,
  );
  assert.throws(
    () => readCloudConfig("https://project.supabase.co", "sb_secret_example"),
    /secret/,
  );
  const jwt = (role: string) =>
    `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString("base64url")}.signature`;
  assert.throws(
    () => readCloudConfig("https://project.supabase.co", jwt("service_role")),
    /public key|publishable/,
  );
  assert.equal(
    readCloudConfig("https://project.supabase.co/", jwt("anon"))?.url,
    "https://project.supabase.co",
  );
});
