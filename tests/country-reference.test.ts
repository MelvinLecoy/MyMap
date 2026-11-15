import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { importCountryReference } from "../scripts/country-reference-importer";
import { importCountryHistory } from "../scripts/country-importer";
import { readCSV } from "../scripts/importer";
import {
  gdpPerCapita,
  indexedPool,
  median,
  metricIndex,
} from "../scripts/country-metric-index";
import { derivedPerCapita } from "../scripts/prepare-country-gdp-per-capita";
import starter from "../data/countries.sample.json";
import provenance from "../data/sources/country-reference.json";
import {
  continentMedianLabel,
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
const comparisonRegions = readFileSync(
  "data/country-comparison-regions.csv",
  "utf8",
);
const load = (
  figures = metrics,
  comparisons = medians,
  regions = comparisonRegions,
) =>
  importCountryReference(
    figures,
    comparisons,
    highlights,
    countries,
    provenance.sources,
    regions,
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
  assert.equal(lookup.byCode.get("TR")!.continent, "Asia");
  assert.equal(countryMetricContext(lookup, "TR", "area").continent, "Europe");
  assert.equal(
    countryMetricContext(lookup, "TR", "gdp").continentalMedian,
    198.235,
  );
  assert.equal(
    countryMetricContext(lookup, "TR", "gdpPerCapita").continentalMedian,
    41338.486629811196,
  );
  assert.equal(
    countryMetricContext(lookup, "TR", "gdpPerCapita").continentalMedianIndex,
    65.02643289864008,
  );
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
  for (const [continent, short] of [
    ["Africa", "AF"],
    ["Asia", "AS"],
    ["Europe", "EU"],
    ["North America", "NA"],
    ["South America", "SA"],
    ["Oceania", "OC"],
  ])
    assert.equal(continentMedianLabel(continent), `${short} median`);
  assert.deepEqual(formatCountryValue("population", 1412914089, 2), {
    amount: "1.41",
    suffix: "B",
  });
  assert.deepEqual(formatCountryValue("population", 1476625576, 2), {
    amount: "1.48",
    suffix: "B",
  });
  assert.deepEqual(formatCountryValue("gdpPerCapita", 126557.01204667334), {
    amount: "127",
    suffix: "K",
  });
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

test("offline model V1 handles ties, missing values, valid zeros and separate comparison pools", () => {
  assert.equal(metricIndex(100, 100, 1, 4), 100);
  assert.equal(metricIndex(0, 100, 4, 4), 0);
  assert.equal(metricIndex(0, 0, 1, 2), null);
  assert.equal(metricIndex(100, 100, 1, 1), null);
  assert.equal(gdpPerCapita(2, 1000000), 2000);
  assert.equal(gdpPerCapita(0, 1000000), 0);
  assert.equal(gdpPerCapita(null, 1000000), null);
  assert.equal(gdpPerCapita(2, null), null);
  assert.equal(gdpPerCapita(2, 0), null);
  assert.equal(median([null, 2, 6, 10, 20]), 8);
  const tied = indexedPool([
    { code: "A", value: 100 },
    { code: "B", value: 50 },
    { code: "C", value: 50 },
    { code: "D", value: 0 },
    { code: "E", value: null },
  ]);
  assert.equal(tied.count, 4);
  assert.deepEqual(
    [...tied.scores.values()].map((item) => item.rank),
    [1, 2, 2, 4],
  );
  const prepared = derivedPerCapita(
    "CountryCode,Category,Continent,GdpUsdBillions,Population\nAA,195,Europe,0.002,1000\nBB,197,Europe,0.002,2000\nCC,195,Asia,0.001,1000\nDD,195,Asia,,1000\nEE,Territory,Europe,1,1000\nFF,Territory,Europe,0.5,1000\n",
    "Region\nGlobal\nEurope\nAsia\n",
  );
  assert.equal(prepared.countryPool.count, 3);
  assert.equal(prepared.territoryPool.count, 2);
  assert.equal(prepared.metrics.get("AA")!.index, 100);
  assert.equal(prepared.metrics.get("EE")!.index, 100);
  assert.deepEqual(prepared.metrics.get("DD"), { value: null, index: null });
  assert.equal(prepared.medians.get("Global")!.value, 1000);
  assert.equal(prepared.medians.get("Europe")!.value, 1500);
  assert.equal(
    prepared.medians.get("Europe")!.index,
    (100 + prepared.metrics.get("BB")!.index!) / 2,
  );
  assert.equal(
    prepared.medians.get("Asia")!.index,
    prepared.metrics.get("CC")!.index,
  );
});

test("GDP per capita is stored at full precision with independent country medians and static profile lookups", () => {
  const swiss = countryMetricContext(lookup, "CH", "gdpPerCapita");
  assert.equal(swiss.value, 126557.01204667334);
  assert.equal(swiss.index, 87.15988504555487);
  assert.equal(swiss.worldMedian, 8530.008307145341);
  assert.equal(swiss.continentalMedian, 41338.486629811196);
  assert.equal(swiss.worldMedianIndex, 35.630267938667494);
  assert.equal(swiss.continentalMedianIndex, 65.02643289864008);
  assert.equal(countryMetricContext(lookup, "MC", "gdpPerCapita").index, 100);
  assert.equal(countryMetricContext(lookup, "ER", "gdpPerCapita").value, null);
  assert.equal(countryMetricContext(lookup, "VA", "gdpPerCapita").index, null);
  assert.equal(countryMetricContext(lookup, "SJ", "gdpPerCapita").value, null);
  const prepared = derivedPerCapita(metrics, medians);
  assert.equal(prepared.countryPool.count, 195);
  assert.equal(prepared.territoryPool.count, 39);
  for (const { values: row } of readCSV(metrics)) {
    const expected = prepared.metrics.get(row.countrycode)!;
    assert.equal(
      row.gdppercapitausd,
      expected.value === null ? "" : String(expected.value),
    );
    assert.equal(
      row.gdppercapitaindex,
      expected.index === null ? "" : String(expected.index),
    );
  }
  for (const { values: row } of readCSV(medians)) {
    const expected = prepared.medians.get(row.region)!;
    assert.equal(Number(row.gdppercapitausd), expected.value);
    assert.equal(Number(row.gdppercapitaindex), expected.index);
  }
  // The browser must trust the saved hard stats, rather than recalculate them.
  const changed = createCountryReferenceLookup(
    load(
      metrics.replace("126557.01204667334,87.15988504555487", "123456,12.3"),
    ),
  );
  assert.equal(
    countryMetricContext(changed, "CH", "gdpPerCapita").value,
    123456,
  );
  assert.equal(countryMetricContext(changed, "CH", "gdpPerCapita").index, 12.3);
});

test("reference imports reject incomplete joins, invalid supplied numbers and incomplete median tables", () => {
  assert.throws(
    () => load(metrics, medians, "CountryCode,MedianRegion\nTR,Global\n"),
    /comparison region/,
  );
  assert.throws(
    () => load(metrics, medians, comparisonRegions + "TR,Asia\n"),
    /comparison region/,
  );
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
