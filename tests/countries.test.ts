import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCountryRecords,
  matchesVisit,
  searchText,
} from "../src/lib/countries";
import type { City } from "../src/lib/types";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import CountryDetail from "../src/components/CountryDetail";

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

test("country details preserve supplied totals and date precision without guessing from partial history", () => {
  const [country] = buildCountryRecords(
    [
      {
        code: "FR",
        name: "France",
        continent: "Europe",
        visit: "visited",
        firstVisitOrder: 20,
        timesVisited: null,
        totalDaysSpent: null,
        visits: [
          { number: 2, arrival: "2025-10", departure: "2025-10", daysSpent: 7 },
          {
            number: 1,
            arrival: "2022-06-01",
            departure: "2022-06-05",
            daysSpent: 5,
          },
        ],
      },
    ],
    [],
  );
  const html = renderToStaticMarkup(
    createElement(CountryDetail, {
      country,
      cities: [],
      countryCount: 1,
      onBack: () => {},
      onSelectCity: () => {},
    }),
  );
  assert.match(html, /aria-label="Visit order 20"/);
  assert.doesNotMatch(html, /<dt>Visit order/);
  assert.match(html, /1 – 5 June 2022/);
  assert.match(html, /October 2025/);
  assert.match(html, /7 days/);
  assert.ok(html.indexOf("Visit 1") < html.indexOf("Visit 2"));
  assert.match(html, /Times visited<\/dt><dd><span[^>]*>Not recorded/);
  assert.match(html, /Days spent<\/dt><dd><span[^>]*>Not recorded/);
  assert.match(html, /No cities added/);
});
