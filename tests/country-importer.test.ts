import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { importCountryHistory } from "../scripts/country-importer";
import {
  buildCountryRecords,
  countryVisitOrders,
  inCountrySet,
  mergeCountryVisits,
} from "../src/lib/countries";
import type { City } from "../src/lib/types";
import starter from "../data/countries.sample.json";

const overview = readFileSync("data/countries.csv", "utf8");
const history = readFileSync("data/country-visit-history.csv", "utf8");
const periods = readFileSync("data/country-visit-periods.csv", "utf8");
const countries = importCountryHistory(
  overview,
  history,
  starter.countries,
  periods,
);
const overviewHeader =
  "CountryCode,Country,Continent,Is195,VisitStatus,FirstVisitOrder,TimesVisited,TotalDaysSpent,VisitHistoryComplete,Notes\n";
const historyHeader =
  "CountryCode,VisitNumber,ArrivalDate,DepartureDate,DaysSpent,Notes\n";

test("the verified yearbook imports 114 dated visits and six undated known visits without inventing lifetime totals", () => {
  assert.equal(
    countries.filter((country) => inCountrySet(country, 195)).length,
    195,
  );
  assert.equal(
    countries.filter((country) => inCountrySet(country, 197)).length,
    197,
  );
  const visited = countries.filter((country) => country.visit === "visited");
  assert.equal(visited.length, 98);
  for (const country of visited) {
    assert.equal(country.timesVisited, null);
    assert.equal(country.totalDaysSpent, null);
    assert.equal(country.visitHistoryComplete, false);
  }
  assert.equal(
    visited.reduce((n, c) => n + (c.recordedVisits ?? 0), 0),
    114,
  );
  assert.equal(
    visited.reduce((n, c) => n + (c.recordedDaysSpent ?? 0), 0),
    273.5,
  );
  assert.equal(visited.flatMap((c) => c.visits ?? []).length, 120);
  assert.equal(
    visited.flatMap((c) => c.visits?.flatMap((v) => v.periods ?? []) ?? [])
      .length,
    127,
  );
  for (const code of ["CA", "DO", "HN", "IS", "JM", "US"]) {
    const country = visited.find((c) => c.code === code)!;
    assert.equal(country.recordedVisits, null);
    assert.deepEqual(
      country.visits?.map((v) => [
        v.number,
        v.arrival,
        v.departure,
        v.daysSpent,
      ]),
      [[1, null, null, null]],
    );
  }
  assert.equal(
    countries.find((country) => country.code === "TW")?.firstVisitOrder,
    null,
  );
  assert.equal(
    countries.find((country) => country.code === "TW")?.visit,
    "unknown",
  );
  assert.ok(countries.some((country) => country.code === "SJ"));
  assert.ok(
    !inCountrySet(countries.find((country) => country.code === "SJ")!, 197),
  );
});

test("country set selection changes ranks consistently and retains the stored chronology", () => {
  const base = countryVisitOrders(countries, 195);
  const full = countryVisitOrders(countries, 197);
  assert.equal(base.size, 97);
  assert.equal(full.size, 98);
  assert.equal(base.get("HN"), 97);
  assert.equal(full.get("HN"), 98);
  assert.equal(base.get("TJ"), 74);
  assert.equal(full.get("TJ"), 75);
  assert.equal(base.get("XK"), undefined);
  assert.equal(full.get("XK"), 74);
  assert.equal(full.get("TW"), undefined);
  assert.equal(
    countries.find((country) => country.code === "HN")?.firstVisitOrder,
    98,
  );
});

test("country-only visits color the country without marking its cities visited", () => {
  const cities = [
    { countryCode: "CN", country: "China", visit: "unknown" },
  ] as City[];
  const records = buildCountryRecords(countries, cities);
  const fills = mergeCountryVisits(
    [{ code: "CN", visited: false, color: null }],
    records,
  );
  assert.equal(fills.find((country) => country.code === "CN")?.visited, true);
  assert.equal(fills.filter((country) => country.visited).length, 98);
  assert.equal(cities[0].visit, "unknown");
  assert.equal(
    records.find((country) => country.code === "CN")?.timesVisited,
    null,
  );
});

test("complete visits calculate inclusive days, preserve partial dates, and agree with supplied totals", () => {
  const examples = importCountryHistory(
    readFileSync("data/templates/countries-examples.csv", "utf8"),
    readFileSync("data/templates/country-visits-examples.csv", "utf8"),
  );
  assert.equal(
    examples.find((country) => country.code === "FR")?.totalDaysSpent,
    8,
  );
  assert.equal(
    examples.find((country) => country.code === "JP")?.visits?.[0].daysSpent,
    10,
  );
  assert.equal(
    examples.find((country) => country.code === "JP")?.visits?.[1].arrival,
    "2025-10",
  );
  assert.equal(
    examples.find((country) => country.code === "JP")?.totalDaysSpent,
    17,
  );
  const [sameDay] = importCountryHistory(
    overviewHeader + "FR,France,Europe,1,visited,1,,,1,\n",
    historyHeader + "FR,1,2024-02-29,2024-02-29,,\n",
  );
  assert.equal(sameDay.timesVisited, 1);
  assert.equal(sameDay.totalDaysSpent, 1);
});

test("incomplete history preserves reported totals and keeps missing totals unknown", () => {
  const [declared] = importCountryHistory(
    overviewHeader + "FR,France,Europe,1,visited,1,5,40,0,\n",
    historyHeader + "FR,1,2024-06,2024-06,3,\n",
  );
  assert.equal(declared.timesVisited, 5);
  assert.equal(declared.totalDaysSpent, 40);
  const [missing] = importCountryHistory(
    overviewHeader + "FR,France,Europe,1,visited,1,,,0,\n",
    historyHeader + "FR,1,2024-06,2024-06,,\n",
  );
  assert.equal(missing.timesVisited, null);
  assert.equal(missing.totalDaysSpent, null);
  assert.equal(missing.visits?.[0].daysSpent, null);
});

test("invalid dates, duplicate visits and conflicting totals stop a country import", () => {
  const row = "FR,France,Europe,1,visited,1,,,0,\n";
  assert.throws(
    () => importCountryHistory(overviewHeader + row + row, historyHeader),
    /duplicate country/,
  );
  assert.throws(
    () =>
      importCountryHistory(
        overviewHeader + row,
        historyHeader + "FR,1,,,,\nFR,1,,,,\n",
      ),
    /duplicate visit/,
  );
  assert.throws(
    () =>
      importCountryHistory(
        overviewHeader + row,
        historyHeader + "FR,1,2025-02-29,,,\n",
      ),
    /valid YYYY/,
  );
  assert.throws(
    () =>
      importCountryHistory(
        overviewHeader + row,
        historyHeader + "FR,1,2025,2024-12-31,,\n",
      ),
    /before arrival/,
  );
  assert.throws(
    () =>
      importCountryHistory(
        overviewHeader + row.replace(",,,0,", ",1,3,1,"),
        historyHeader + "FR,1,2025-01-01,2025-01-05,,\n",
      ),
    /TotalDaysSpent/,
  );
});
