import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importCountryReference } from "../scripts/country-reference-importer";
import { importCountryHistory } from "../scripts/country-importer";
import { readCSV } from "../scripts/importer";
import starter from "../data/countries.sample.json";
import provenance from "../data/sources/country-reference.json";
import {
  countryMetricContext,
  createCountryReferenceLookup,
  formatCountryValue,
  formatMetricIndex,
} from "../src/lib/country-reference";

const countries = importCountryHistory(
  readFileSync("data/countries.csv", "utf8"),
  readFileSync("data/country-visit-history.csv", "utf8"),
  starter.countries,
  readFileSync("data/country-visit-periods.csv", "utf8"),
);
const metrics = readFileSync("data/country-metrics.csv", "utf8"),
  medians = readFileSync("data/country-metric-medians.csv", "utf8"),
  highlights = readFileSync("data/country-highlights.csv", "utf8");
const load = (figures = metrics, comparisons = medians) =>
  importCountryReference(
    figures,
    comparisons,
    highlights,
    countries,
    provenance.sources,
  );
const data = load(),
  lookup = createCountryReferenceLookup(data);

test("the complete workbook and method remain archived, and every supplied country and territory survives CSV extraction", () => {
  for (const [path, hash] of Object.entries(provenance.csvSha256))
    assert.equal(
      createHash("sha256").update(readFileSync(path)).digest("hex"),
      hash,
    );
  for (const source of [provenance.workbook, provenance.methodReference])
    assert.equal(
      createHash("sha256").update(readFileSync(source.path)).digest("hex"),
      source.sha256,
    );
  const rows = readCSV(metrics);
  assert.equal(rows.length, 250);
  assert.equal(new Set(rows.map((r) => r.values.countrycode)).size, 250);
  assert.equal(
    rows.filter((r) => r.values.category === "Territory").length,
    53,
  );
  assert.equal(data.countries.length, 198);
  assert.equal(
    data.countries.filter((c) => c.category === "195" || c.category === "197")
      .length,
    197,
  );
  assert.deepEqual(
    new Set(data.countries.map((c) => c.code)),
    new Set(countries.map((c) => c.code)),
  );
  for (const country of data.countries) {
    assert.equal(country.facts.length, 3);
    assert.equal(country.attractions.length, 3);
    assert.ok(country.cities.length >= 1 && country.cities.length <= 3);
  }
  assert.deepEqual(lookup.byCode.get("US")!.cities, [
    "New York City",
    "Los Angeles",
    "Chicago",
  ]);
});

test("country values, indices and both median sets are direct workbook lookups with full precision", () => {
  const swiss = countryMetricContext(lookup, "CH", "gdp");
  assert.equal(swiss.value, 1140);
  assert.equal(swiss.index, 59.31460246556111);
  assert.equal(swiss.worldMedian, 53.16);
  assert.equal(swiss.continentalMedian, 198.235);
  assert.equal(swiss.worldMedianIndex, 23.413777972507063);
  assert.equal(swiss.continentalMedianIndex, 38.20049336042584);
  assert.equal(countryMetricContext(lookup, "CN", "area").value, 9596960);
  assert.equal(
    countryMetricContext(lookup, "CN", "gdp").index,
    93.68727107238098,
  );
  const changed = createCountryReferenceLookup(
    load(
      metrics.replace("93.68727107238098", "12.345"),
      medians.replace("53.16", "54.321"),
    ),
  );
  assert.equal(countryMetricContext(changed, "CN", "gdp").value, 21550);
  assert.equal(countryMetricContext(changed, "CN", "gdp").index, 12.345);
  assert.equal(countryMetricContext(changed, "CH", "gdp").worldMedian, 54.321);
  assert.equal(
    countryMetricContext(changed, "CH", "gdp").worldMedianIndex,
    23.413777972507063,
  );
  assert.equal(countryMetricContext(lookup, "TR", "area").continent, "Asia");
  assert.equal(countries.find((c) => c.code === "TR")!.continent, "Europe");
});

test("missing data stays missing, zero stays zero, and Svalbard's combined-territory record is not applied to its profile", () => {
  assert.equal(countryMetricContext(lookup, "ER", "gdp").value, null);
  assert.equal(countryMetricContext(lookup, "VA", "gdp").index, null);
  assert.equal(countryMetricContext(lookup, "TW", "gdp").value, 1020);
  assert.equal(countryMetricContext(lookup, "KP", "gdp").value, 17.199287595);
  for (const value of Object.values(lookup.byCode.get("SJ")!.metrics))
    assert.deepEqual(value, { value: null, index: null });
  assert.equal(
    countryMetricContext(lookup, "SJ", "population").worldMedian,
    null,
  );
  const rows = readCSV(metrics);
  const antarctica = rows.find((r) => r.values.countrycode === "AQ")!.values;
  assert.equal(antarctica.population, "0");
  assert.equal(antarctica.populationindex, "0");
  assert.equal(
    rows.find((r) => r.values.countrycode === "SJ")!.values.population,
    "2933",
  );
  const withZero = createCountryReferenceLookup(
    load(metrics.replace("9007798,27.66802133584485", "0,0")),
  );
  assert.equal(countryMetricContext(withZero, "CH", "population").value, 0);
  assert.equal(countryMetricContext(withZero, "CH", "population").index, 0);
});

test("smart formatting follows the requested examples, retains middle hundredths and keeps every GDP in billions", () => {
  assert.deepEqual(formatCountryValue("population", 9090000), {
    amount: "9.1",
    suffix: "M",
  });
  assert.deepEqual(formatCountryValue("gdp", 884.94), {
    amount: "885",
    suffix: "B",
  });
  assert.deepEqual(formatCountryValue("area", 41280), {
    amount: "41.3",
    suffix: "K",
  });
  assert.deepEqual(formatCountryValue("area", 41230), {
    amount: "41.23",
    suffix: "K",
  });
  assert.deepEqual(formatCountryValue("area", 41270), {
    amount: "41.27",
    suffix: "K",
  });
  assert.deepEqual(formatCountryValue("gdp", 32640), {
    amount: "32,640",
    suffix: "B",
  });
  assert.deepEqual(formatCountryValue("gdp", 0.016), {
    amount: "0.016",
    suffix: "B",
  });
  assert.deepEqual(formatCountryValue("area", 0.44), {
    amount: "0.44",
    suffix: "",
  });
  assert.deepEqual(formatCountryValue("population", 0), {
    amount: "0",
    suffix: "",
  });
  assert.equal(formatMetricIndex(0), "0.0");
  assert.equal(formatMetricIndex(100), "100.0");
  assert.equal(formatMetricIndex(59.31460246556111), "59.3");
});

test("reference imports reject incomplete joins, invalid supplied numbers and incomplete median tables", () => {
  assert.throws(
    () => load(metrics + metrics.split("\n")[1] + "\n"),
    /duplicate/,
  );
  assert.throws(
    () => load(metrics.replace("CountryCode,", "MissingCode,")),
    /Missing required CSV headers/,
  );
  assert.throws(
    () => load(metrics.replace("9007798", "-1")),
    /Invalid supplied country metric/,
  );
  assert.throws(
    () => load(metrics.replace("93.68727107238098", "101")),
    /Invalid supplied country metric/,
  );
  assert.throws(
    () =>
      load(
        metrics,
        medians
          .split("\n")
          .filter((line) => !line.startsWith("Europe,"))
          .join("\n"),
      ),
    /median coverage is incomplete/,
  );
  assert.throws(
    () =>
      importCountryReference(metrics, medians, highlights, countries, {
        ...provenance.sources,
        "country-info": { label: "Invalid", url: "http://invalid.example" },
      }),
    /HTTPS/,
  );
});
