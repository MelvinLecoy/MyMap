import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importCountryReference } from "../scripts/country-reference-importer";
import { importCountryHistory } from "../scripts/country-importer";
import starter from "../data/countries.sample.json";
import provenance from "../data/sources/country-reference.json";
import {
  COUNTRY_METRICS,
  compactCountryValue,
  countryMetricContext,
  createCountryReferenceIndex,
  globalStanding,
  formatStanding,
} from "../src/lib/country-reference";

const countries = importCountryHistory(
  readFileSync("data/countries.csv", "utf8"),
  readFileSync("data/country-visit-history.csv", "utf8"),
  starter.countries,
  readFileSync("data/country-visit-periods.csv", "utf8"),
);
const metrics = readFileSync("data/country-metrics.csv", "utf8");
const highlights = readFileSync("data/country-highlights.csv", "utf8");
const data = importCountryReference(
  metrics,
  highlights,
  countries,
  provenance.sources,
);
const index = createCountryReferenceIndex(data);

test("static country references cover every country code, preserve provenance and keep territories out of comparisons", () => {
  assert.equal(data.countries.length, 198);
  assert.equal(
    data.countries.filter((country) => country.comparable).length,
    197,
  );
  assert.deepEqual(
    new Set(data.countries.map((c) => c.code)),
    new Set(countries.map((c) => c.code)),
  );
  for (const [path, hash] of Object.entries(provenance.csvSha256)) {
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      hash,
    );
  }
  for (const country of data.countries) {
    assert.equal(country.facts.length, 3, country.code);
    assert.equal(country.attractions.length, 3, country.code);
    assert.ok(
      country.cities.length >= 1 && country.cities.length <= 3,
      country.code,
    );
  }
  assert.deepEqual(index.byCode.get("CH")!.cities, [
    "Zürich",
    "Geneva",
    "Basel",
  ]);
  assert.deepEqual(index.byCode.get("SG")!.cities, ["Singapore"]);
  assert.deepEqual(index.byCode.get("US")!.cities, [
    "New York City",
    "Los Angeles",
    "Chicago",
  ]);
  assert.deepEqual(index.byCode.get("AM")!.cities, [
    "Yerevan",
    "Gyumri",
    "Vanadzor",
  ]);
  assert.deepEqual(index.byCode.get("HU")!.cities, [
    "Budapest",
    "Debrecen",
    "Szeged",
  ]);
  assert.deepEqual(index.byCode.get("VA")!.cities, ["Vatican City"]);
  assert.deepEqual(index.byCode.get("SJ")!.metrics, {
    population: null,
    area: null,
    gdp: null,
  });
  assert.equal(index.benchmarks.population.values.length, 197);
  assert.equal(index.benchmarks.gdp.values.length, 194);
  assert.deepEqual(
    data.countries
      .filter((c) => !c.metrics.gdp)
      .map((c) => c.code)
      .sort(),
    ["KP", "SJ", "TW", "VA"],
  );
});

test("global standing is scale independent, spreads small countries meaningfully and gives equal values equal scores", () => {
  assert.equal(globalStanding(10, [10, 20, 30]), 1);
  assert.equal(globalStanding(20, [10, 20, 30]), 50.5);
  assert.equal(globalStanding(30, [10, 20, 30]), 100);
  assert.equal(globalStanding(20, [10, 20, 20, 30]), 50.5);
  assert.equal(globalStanding(20000, [10000, 20000, 20000, 30000]), 50.5);
  assert.equal(globalStanding(10, []), null);
  assert.equal(globalStanding(10, [10]), 100);
  for (const [metric, code] of [
    ["population", "IN"],
    ["area", "RU"],
    ["gdp", "US"],
  ] as const) {
    assert.equal(index.benchmarks[metric].leader?.code, code);
    assert.equal(countryMetricContext(index, code, metric).standing, 100);
  }
  const swissGdp = countryMetricContext(index, "CH", "gdp");
  assert.ok(swissGdp.standing! > 80);
  assert.ok(
    swissGdp.reference!.value /
      index.benchmarks.gdp.leader!.metrics.gdp!.value <
      0.04,
  );
});

test("world and continental arithmetic means use available country records once and preserve missing values", () => {
  for (const metric of COUNTRY_METRICS) {
    const swiss = countryMetricContext(index, "CH", metric);
    const global = data.countries
      .filter((c) => c.comparable && c.metrics[metric])
      .map((c) => c.metrics[metric]!.value);
    const europe = data.countries
      .filter(
        (c) => c.comparable && c.continent === "Europe" && c.metrics[metric],
      )
      .map((c) => c.metrics[metric]!.value);
    assert.equal(
      swiss.worldAverage,
      global.reduce((a, b) => a + b, 0) / global.length,
    );
    assert.equal(
      swiss.continentAverage,
      europe.reduce((a, b) => a + b, 0) / europe.length,
    );
  }
  assert.equal(countryMetricContext(index, "VA", "gdp").standing, null);
  assert.equal(countryMetricContext(index, "VA", "gdp").reference, null);
  const shuffled = createCountryReferenceIndex({
    ...data,
    countries: [...data.countries].reverse(),
  });
  assert.equal(
    countryMetricContext(shuffled, "CH", "population").standing,
    countryMetricContext(index, "CH", "population").standing,
  );
});

test("compact numbers retain two decimals, promote rounded units and round standing as requested", () => {
  assert.deepEqual(compactCountryValue(41284), {
    amount: "41.28",
    suffix: "K",
  });
  assert.deepEqual(compactCountryValue(0.44), { amount: "0.44", suffix: "" });
  assert.deepEqual(compactCountryValue(999999), {
    amount: "1.00",
    suffix: "M",
  });
  assert.deepEqual(compactCountryValue(884940402230.4088), {
    amount: "884.94",
    suffix: "B",
  });
  assert.equal(formatStanding(0.64), "0.6");
  assert.equal(formatStanding(50.5), "51");
});

test("country reference imports reject broken joins, invalid values, missing columns and unsafe source links", () => {
  assert.throws(
    () =>
      importCountryReference(
        metrics.replace(/\bCN,1,/, "ZZ,1,"),
        highlights,
        countries,
        provenance.sources,
      ),
    /Unknown or duplicate/,
  );
  assert.throws(
    () =>
      importCountryReference(
        metrics.replace("CountryCode,", "MissingCode,"),
        highlights,
        countries,
        provenance.sources,
      ),
    /Missing required CSV headers/,
  );
  assert.throws(
    () =>
      importCountryReference(
        metrics.replace("9092436", "-1"),
        highlights,
        countries,
        provenance.sources,
      ),
    /Invalid country reference value/,
  );
  assert.throws(
    () =>
      importCountryReference(metrics, highlights, countries, {
        ...provenance.sources,
        "world-bank-population": {
          label: "Invalid",
          url: "http://invalid.example",
        },
      }),
    /HTTPS/,
  );
});
