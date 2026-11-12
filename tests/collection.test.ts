import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importCities, parseMapLink, readCSV } from "../scripts/importer.js";

const raw = readCSV(readFileSync("data/MyMap_Converted_Full.csv", "utf8"));
const normalized = readCSV(readFileSync("data/cities.csv", "utf8"));
const coordinates = readCSV(readFileSync("data/coordinates.csv", "utf8"));
const { data, issues } = importCities(readFileSync("data/cities.csv", "utf8"), {
  coordinates: readFileSync("data/coordinates.csv", "utf8"),
});

test("the published collection preserves all rows and links from the updated CSV", () => {
  const metadata = JSON.parse(
    readFileSync("data/collection-info.json", "utf8"),
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync("data/MyMap_Converted_Full.csv"))
      .digest("hex"),
    metadata.sourceSha256,
  );
  assert.equal(raw.length, 321);
  assert.equal(normalized.length, raw.length);
  const countryOverrides: Record<string, string> = {
    Longyearbyen: "Svalbard",
    Sevastopol: "Ukraine",
  };
  for (let i = 0; i < raw.length; i++) {
    const original = raw[i].values;
    const prepared = normalized[i].values;
    assert.equal(prepared.cities, original.cities);
    assert.equal(
      prepared.country,
      countryOverrides[original.cities] ?? original.country,
    );
    for (const field of ["continent", "region", "subregion", "status"]) {
      assert.equal(prepared[field], original[field]);
    }
    const sourceUrl = /^src="([^"]+)"$/.exec(original.link)?.[1];
    assert.ok(sourceUrl, original.cities);
    assert.deepEqual(parseMapLink(prepared.link), parseMapLink(sourceUrl));
    assert.equal(prepared.visited, "No");
  }
  assert.equal(data.demo, false);
  assert.equal(new Set(data.cities.map((city) => city.id)).size, 321);
  const mapIds = data.cities.map((city) => {
    assert.ok(city.map);
    return new URL(city.map.embedUrl).searchParams.get("mid");
  });
  assert.equal(new Set(mapIds).size, 321);
  const nice = data.cities.find((city) => city.name === "Nice")!;
  assert.equal(
    new URL(nice.map!.embedUrl).searchParams.get("mid"),
    "1VgVwKHS5nWFFAesEvKnpHjZEcn6wa4Y",
  );
  for (const name of [
    "Johannesburg",
    "Belize City",
    "Frankfurt am Main",
    "Kingstown",
  ]) {
    assert.ok(data.cities.some((city) => city.name === name));
  }
  assert.equal(
    data.cities.find((city) => city.name === "Kampala")!.country,
    "Uganda",
  );
});

test("reviewed coordinates cover 319 distinct places and leave only the two requested regions unplaced", () => {
  assert.equal(coordinates.length, 319);
  assert.equal(new Set(coordinates.map((row) => row.values.cityid)).size, 319);
  assert.equal(
    new Set(coordinates.map((row) => row.values.geonamesid)).size,
    319,
  );
  assert.deepEqual(
    data.cities
      .filter((city) => !city.coordinates)
      .map((city) => city.name)
      .sort(),
    ["Iguazu", "Lofoten"],
  );
  assert.equal(issues.length, 2);
  assert.ok(
    issues.every((issue) => issue.message.startsWith("Missing location:")),
  );
  assert.equal(
    data.cities.find((city) => city.name === "Longyearbyen")!.countryCode,
    "SJ",
  );
  assert.equal(
    data.cities.find((city) => city.name === "Sevastopol")!.countryCode,
    "UA",
  );
  assert.equal(data.geonames, true);
});

test("the real collection contains no sample visits, notes, dates, or colors", () => {
  assert.ok(data.cities.every((city) => city.visit === "not-visited"));
  assert.ok(
    data.cities.every(
      (city) => !city.lastVisited && !city.notes && !city.pinColor,
    ),
  );
  assert.ok(
    data.countries.every((country) => !country.visited && !country.color),
  );
  assert.equal(
    data.cities.filter((city) => city.status === "Complete").length,
    253,
  );
  assert.equal(
    data.cities.filter((city) => city.status === "Unfinished").length,
    7,
  );
  assert.equal(
    data.cities.filter((city) => city.status === "Not Started").length,
    61,
  );
});
