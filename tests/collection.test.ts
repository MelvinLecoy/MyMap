import {
  derivedCityVisitsCsv,
  readCollectionCsv,
} from "../scripts/collection-inputs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importCities, parseMapLink, readCSV } from "../scripts/importer.js";

const normalized = readCSV(readCollectionCsv("data/cities.csv"));
const coordinates = readCSV(readFileSync("data/coordinates.csv", "utf8"));
const geography = new Map(
  readCSV(readFileSync("data/reference/country-geography.csv", "utf8")).map(
    ({ values: row }) => [row.countrycode, row],
  ),
);
const { data, issues } = importCities(readCollectionCsv("data/cities.csv"), {
  coordinates: readFileSync("data/coordinates.csv", "utf8"),
  cityVisits: derivedCityVisitsCsv(),
  cityPeriods: readCollectionCsv("data/city-visit-periods.csv"),
});

test("the canonical collection has stable identities and reproduces every current map link and classification", () => {
  const metadata = JSON.parse(
    readFileSync("data/collection-info.json", "utf8"),
  );
  assert.equal(metadata.schemaVersion, 2);
  assert.equal(metadata.records, 361);
  assert.equal(normalized.length, 361);
  assert.equal(
    new Set(normalized.map(({ values: row }) => row.cityid)).size,
    361,
  );
  for (const { values: row } of normalized) {
    const city = data.cities.find((city) => city.id === row.cityid)!;
    assert.equal(city.name, row.cities);
    assert.equal(city.countryCode, row.countrycode);
    assert.deepEqual(city.map, parseMapLink(row.link));
    const classification = geography.get(row.countrycode);
    assert.ok(classification || row.countrycode === "SJ", row.cityid);
    if (classification)
      assert.deepEqual(
        [city.continent, city.region, city.subregion],
        [
          classification.continent,
          classification.region,
          classification.subregion,
        ],
        row.cityid,
      );
  }
  assert.equal(data.demo, false);
  assert.equal(new Set(data.cities.map((city) => city.id)).size, 361);
  const mapIds = data.cities
    .filter((c) => c.map)
    .map((city) => {
      assert.ok(city.map);
      return new URL(city.map.embedUrl).searchParams.get("mid");
    });
  assert.equal(new Set(mapIds).size, 342);
  assert.deepEqual(
    data.cities
      .filter((c) => !c.map)
      .map((c) => c.id)
      .sort(),
    [
      "basel-switzerland",
      "bath-uk",
      "cologne-germany",
      "como-italy",
      "detroit-usa",
      "gold-coast-australia",
      "huizhou-china",
      "interlaken-switzerland",
      "jerash-jordan",
      "johor-bahru-malaysia",
      "kunming-china",
      "las-vegas-usa",
      "lugano-switzerland",
      "niagara-falls-usa",
      "portsmouth-uk",
      "rome-italy",
      "southampton-uk",
      "sunshine-coast-australia",
      "vatican-city-vatican-city",
    ],
  );
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

test("the real collection contains only approved city visits and no sample notes or colors", () => {
  assert.equal(
    data.cities.filter((city) => city.visit === "visited").length,
    174,
  );
  assert.equal(data.cities.filter((city) => city.lastVisited).length, 174);
  assert.ok(data.cities.every((city) => !city.notes && !city.pinColor));
  assert.ok(data.countries.every((country) => !country.color));
  assert.equal(
    data.cities.filter((city) => city.status === "Complete").length,
    223,
  );
  assert.equal(
    data.cities.filter((city) => city.status === "Unfinished").length,
    44,
  );
  assert.equal(
    data.cities.filter((city) => city.status === "Not Started").length,
    80,
  );
});
