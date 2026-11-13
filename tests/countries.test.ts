import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCountryRecords,
  matchesVisit,
  searchText,
} from "../src/lib/countries";
import type { City } from "../src/lib/types";

test("country rows count cities by stable country code, including empty countries", () => {
  const cities = [
    { countryCode: "US", country: "USA" },
    { countryCode: "US", country: "United States" },
    { countryCode: "CA", country: "Canada" },
  ] as City[];
  const records = buildCountryRecords(
    [
      {
        code: "US",
        name: "United States",
        continent: "America",
        visit: "unknown",
      },
      { code: "JP", name: "Japan", continent: "Asia", visit: "planned" },
      { code: "CA", name: "Canada", continent: "America", visit: "invalid" },
    ],
    cities,
  );
  assert.deepEqual(
    records.map((country) => [country.name, country.cityCount, country.visit]),
    [
      ["Canada", 1, "unknown"],
      ["Japan", 0, "planned"],
      ["United States", 2, "unknown"],
    ],
  );
  assert.equal(cities[0].country, "USA");
});

test("country visit filters group both not-yet states and search ignores accents", () => {
  assert.equal(matchesVisit("unknown", "not-yet"), true);
  assert.equal(matchesVisit("not-visited", "not-yet"), true);
  assert.equal(matchesVisit("planned", "not-yet"), false);
  assert.equal(matchesVisit("planned", "planned"), true);
  assert.equal(matchesVisit("visited", "visited"), true);
  assert.equal(matchesVisit("unknown", "all"), true);
  assert.equal(searchText("  Côte d’Ivoire  "), "cote d’ivoire");
});
