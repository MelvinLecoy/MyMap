import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { importCountryGeography } from "../scripts/country-geography-importer";
import { importCities, readCSV } from "../scripts/importer";
import { countryCollection } from "../scripts/country-database";
import {
  applyCityGeography,
  applyCountryGeography,
} from "../src/lib/country-geography";
import { buildCountryRecords } from "../src/lib/countries";
import type { City } from "../src/lib/types";
import CountryDetail from "../src/components/CountryDetail";
import provenance from "../data/sources/country-geography.json";

const csv = readFileSync("data/reference/country-geography.csv", "utf8");
const countries = countryCollection();
const reference = importCountryGeography(csv, countries);
const byCode = new Map(reference.map((row) => [row.code, row]));

test("the final workbook is archived and its CSV covers exactly the 197 country identities", () => {
  for (const source of [provenance.workbook, provenance.csv])
    assert.equal(
      createHash("sha256").update(readFileSync(source.path)).digest("hex"),
      source.sha256,
    );
  assert.equal(provenance.workbook.rows, 197);
  assert.equal(reference.length, 197);
  assert.equal(new Set(reference.map((row) => row.code)).size, 197);
  assert.deepEqual(
    new Set(reference.map((row) => row.code)),
    new Set(
      countries
        .filter((country) => country.is195 !== undefined)
        .map((country) => country.code),
    ),
  );
  assert.equal(byCode.has("SJ"), false);
  for (const country of reference) {
    const original = countries.find((row) => row.code === country.code)!;
    assert.equal(country.name, original.name);
    assert.equal(country.continent, original.continent);
  }
});

test("official custom region labels and intentional blank cells are preserved verbatim", () => {
  assert.deepEqual(byCode.get("IR"), {
    code: "IR",
    name: "Iran",
    continent: "Asia",
    region: "Middle East",
    subregion: "Jihadist 4",
  });
  assert.equal(byCode.get("FR")!.subregion, "Powerhouse");
  assert.equal(byCode.get("RO")!.subregion, "Dacia 3");
  assert.equal(byCode.get("SG")!.subregion, "Maritime 6");
  assert.equal(byCode.get("LA")!.subregion, "Mekong 5");
  assert.equal(byCode.get("GB")!.region, "British Isles");
  assert.equal(byCode.get("MR")!.region, "Sahel 6");
  assert.equal(byCode.get("US")!.region, "NA Big 3");
  assert.equal(reference.filter((row) => !row.region).length, 12);
  assert.equal(reference.filter((row) => !row.subregion).length, 103);
  for (const row of reference.filter(
    (country) => country.continent === "South America",
  )) {
    assert.equal(row.region, "");
    assert.equal(row.subregion, "");
  }
});

test("taxonomy imports reject incomplete, duplicate, unknown and malformed reference rows", () => {
  const lines = csv.trimEnd().split("\n");
  assert.throws(
    () => importCountryGeography([...lines, lines[1]].join("\n"), countries),
    /duplicate country KE/,
  );
  assert.throws(
    () =>
      importCountryGeography(
        [lines[0], ...lines.slice(2)].join("\n"),
        countries,
      ),
    /incomplete: KE/,
  );
  assert.throws(
    () =>
      importCountryGeography(csv.replace("KE,Kenya", "ZZ,Kenya"), countries),
    /unknown or duplicate country ZZ/,
  );
  assert.throws(
    () =>
      importCountryGeography(
        csv.replace("KE,Kenya", "KE,Wrong name"),
        countries,
      ),
    /name does not match KE/,
  );
  assert.throws(
    () =>
      importCountryGeography(
        csv.replace("KE,Kenya,Africa", "KE,Kenya,Atlantis"),
        countries,
      ),
    /invalid continent/,
  );
  assert.throws(
    () =>
      importCountryGeography(
        csv.replace("KE,Kenya,Africa,East Africa", "KE,Kenya,Africa,"),
        countries,
      ),
    /subregion requires its parent/,
  );
  assert.throws(
    () =>
      importCountryGeography(
        lines.map((line, index) => line + (index ? "," : ",Extra")).join("\n"),
        countries,
      ),
    /unexpected columns/,
  );
});

test("all current city classifications match their country and Svalbard remains unspecified by the new source", () => {
  const rows = readCSV(readFileSync("data/cities.csv", "utf8"));
  assert.equal(rows.length, 343);
  for (const { values: row } of rows) {
    if (row.countrycode === "SJ") {
      assert.equal(row.continent, "Europe");
      assert.equal(row.region, "Nordic");
      assert.equal(row.subregion, "");
      continue;
    }
    const country = byCode.get(row.countrycode)!;
    assert.ok(country, row.cityid);
    assert.deepEqual(
      [row.continent, row.region, row.subregion],
      [country.continent, country.region, country.subregion],
      row.cityid,
    );
  }
});

test("reference metadata replaces stale database country and city geography without changing personal data", () => {
  const city = {
    id: "london-uk",
    name: "London",
    country: "United Kingdom",
    countryCode: "GB",
    continent: "Old continent",
    region: "Old region",
    subregion: "Old subregion",
    coordinates: [-0.12, 51.5],
    status: "Update",
    visit: "visited",
    lastVisited: "2026-05-03",
    visits: [
      {
        number: 1,
        arrival: "2026-05-01",
        departure: "2026-05-03",
        daysSpent: 2.5,
      },
    ],
    notes: "Personal notes",
    pinColor: null,
    map: null,
  } as City;
  const originalCity = structuredClone(city);
  const [nextCity] = applyCityGeography([city], reference);
  assert.deepEqual(nextCity, {
    ...city,
    continent: "Europe",
    region: "British Isles",
    subregion: "",
  });
  assert.deepEqual(city, originalCity);
  const country = {
    ...countries.find((row) => row.code === "GB")!,
    continent: "Old",
    region: "Old",
    subregion: "Old",
  };
  const originalCountry = structuredClone(country);
  const [nextCountry] = applyCountryGeography([country], reference);
  assert.deepEqual(nextCountry, {
    ...country,
    continent: "Europe",
    region: "British Isles",
    subregion: "",
  });
  assert.deepEqual(country, originalCountry);
  const [southAmerica] = applyCountryGeography(
    [{ ...country, code: "AR" }],
    reference,
  );
  assert.equal(southAmerica.region, "");
  assert.equal(southAmerica.subregion, "");
  const svalbardCity = {
    ...city,
    id: "longyearbyen-svalbard",
    countryCode: "SJ",
    continent: "Europe",
    region: "Northern Europe",
    subregion: "",
  };
  assert.deepEqual(
    applyCityGeography([svalbardCity], reference)[0],
    svalbardCity,
  );
  const [svalbardCountry] = applyCountryGeography(
    [{ ...country, code: "SJ", continent: "Europe" }],
    reference,
  );
  assert.deepEqual(
    [
      svalbardCountry.continent,
      svalbardCountry.region,
      svalbardCountry.subregion,
    ],
    ["Europe", "", ""],
  );
  for (const code of [null, "AQ", "ZZ"]) {
    const unclassified = { ...city, countryCode: code };
    // Existing runtime support for null codes and newly added territories must
    // stay usable until their reference metadata is explicitly reviewed.
    assert.deepEqual(
      applyCityGeography([unclassified], reference)[0],
      unclassified,
    );
    assert.throws(
      () => applyCityGeography([unclassified], reference, { strict: true }),
      /explicitly classified CountryCode/,
    );
  }
});

test("the build importer applies authoritative city geography and requires explicit country codes", () => {
  const header =
    "Cities,Country,Continent,Region,SubRegion,Status,Link,Latitude,Longitude,CountryCode";
  const row = "London,United Kingdom,Old,Old,Old,Complete,,51.5,-.12,GB";
  const city = importCities(header + "\n" + row, {
    countryGeography: reference,
  }).data.cities[0];
  assert.deepEqual(
    [city.continent, city.region, city.subregion],
    ["Europe", "British Isles", ""],
  );
  assert.throws(
    () =>
      importCities(header + "\n" + row.replace(/GB$/, ""), {
        countryGeography: reference,
      }),
    /explicit CountryCode is required/,
  );
  assert.throws(
    () =>
      importCities(header + "\n" + row.replace(/GB$/, "AQ"), {
        countryGeography: reference,
      }),
    /explicitly classified CountryCode/,
  );
});

test("country profiles show the complete supplied hierarchy and omit intentional blank levels", () => {
  for (const [code, expected] of [
    ["GB", "Europe / British Isles"],
    ["IR", "Asia / Middle East / Jihadist 4"],
    ["AR", "South America"],
    ["SJ", "Europe"],
  ]) {
    const country = buildCountryRecords(
      applyCountryGeography(
        countries.filter((row) => row.code === code),
        reference,
      ),
      [],
    )[0];
    const html = renderToStaticMarkup(
      createElement(CountryDetail, {
        country,
        cities: [],
        onBack: () => {},
        onSelectCity: () => {},
      }),
    );
    assert.ok(html.includes(`aria-label="Geography">${expected}</p>`), code);
  }
});
