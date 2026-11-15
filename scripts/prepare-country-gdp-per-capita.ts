import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { readCSV } from "./importer";
import {
  COUNTRY_INDEX_MODEL,
  gdpPerCapita,
  indexedPool,
  median,
} from "./country-metric-index";

export function derivedPerCapita(metricsCsv: string, mediansCsv: string) {
  const rows = readCSV(metricsCsv).map((row) => row.values);
  const number = (value: string) => (value === "" ? null : Number(value));
  const values = new Map(
    rows.map((row) => [
      row.countrycode,
      gdpPerCapita(number(row.gdpusdbillions), number(row.population)),
    ]),
  );
  const countries = rows.filter((row) => row.category !== "Territory");
  const territories = rows.filter((row) => row.category === "Territory");
  const pool = (members: typeof rows) =>
    indexedPool(
      members.map((row) => ({
        code: row.countrycode,
        value: values.get(row.countrycode)!,
      })),
    );
  const countryPool = pool(countries),
    territoryPool = pool(territories);
  const metrics = new Map(
    rows.map((row) => {
      const ranked = (
        row.category === "Territory" ? territoryPool : countryPool
      ).scores.get(row.countrycode);
      return [
        row.countrycode,
        { value: values.get(row.countrycode)!, index: ranked?.index ?? null },
      ];
    }),
  );
  const medians = new Map(
    readCSV(mediansCsv).map(({ values: row }) => {
      const members = countries.filter(
        (country) =>
          row.region === "Global" || country.continent === row.region,
      );
      return [
        row.region,
        {
          value: median(
            members.map((country) => metrics.get(country.countrycode)!.value),
          ),
          index: median(
            members.map((country) => metrics.get(country.countrycode)!.index),
          ),
        },
      ];
    }),
  );
  return { metrics, medians, countryPool, territoryPool };
}

function extendCsv(
  text: string,
  key: string,
  derived: Map<string, { value: number | null; index: number | null }>,
) {
  const fields = text
    .split(/\r?\n/, 1)[0]
    .split(",")
    .filter(
      (field) => !["GdpPerCapitaUsd", "GdpPerCapitaIndex"].includes(field),
    );
  const escape = (value: string | number | null) => {
    const text = value === null ? "" : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return (
    [
      [...fields, "GdpPerCapitaUsd", "GdpPerCapitaIndex"].join(","),
      ...readCSV(text).map(({ values: row }) => {
        const next = derived.get(row[key])!;
        return [
          ...fields.map((field) => row[field.toLowerCase()]),
          next.value,
          next.index,
        ]
          .map(escape)
          .join(",");
      }),
    ].join("\n") + "\n"
  );
}

if (
  process.argv[1] &&
  import.meta.url === new URL(process.argv[1], "file:").href
) {
  const metricsPath = "data/country-metrics.csv",
    mediansPath = "data/country-metric-medians.csv";
  const metricsCsv = readFileSync(metricsPath, "utf8"),
    mediansCsv = readFileSync(mediansPath, "utf8");
  const derived = derivedPerCapita(metricsCsv, mediansCsv);
  const nextMetrics = extendCsv(metricsCsv, "countrycode", derived.metrics);
  const nextMedians = extendCsv(mediansCsv, "region", derived.medians);
  const check = process.argv.includes("--check");
  if (check) {
    if (nextMetrics !== metricsCsv || nextMedians !== mediansCsv)
      throw new Error(
        "Stored GDP-per-capita figures, indices or medians differ from the source calculations.",
      );
  } else {
    writeFileSync(metricsPath, nextMetrics);
    writeFileSync(mediansPath, nextMedians);
    const path = "data/sources/country-reference.json";
    const metadata = JSON.parse(readFileSync(path, "utf8"));
    metadata.metrics =
      "The three original raw figures and indices are copied from the owner's workbook. GDP per capita and its index are calculated offline from the supplied raw GDP/population using model V1. All values are stored at full precision in CSV; missing values and numeric zero remain distinct.";
    metadata.comparisons =
      "Original metric medians are copied from Medians 197. GDP-per-capita raw/index medians are calculated offline over the 197-country reference set, excluding missing data. Median regions follow the workbook's UN M49 grouping; existing travel categories are unchanged.";
    metadata.gdpPerCapita = {
      rawFormula: "GdpUsdBillions * 1,000,000,000 / Population",
      model: COUNTRY_INDEX_MODEL,
      preparation:
        "Calculated offline from the supplied workbook's raw values. Competition ranks and maxima are separate for countries and territories. No rounding before indexing or aggregation. Zero or missing population yields N/A; missing GDP yields N/A.",
      medians:
        "World and continental medians use only the 197-country pool and available values. Raw and index medians are calculated separately; continental index medians use the globally computed country indices, not re-ranked continental indices.",
      validCountries: derived.countryPool.count,
      validTerritories: derived.territoryPool.count,
      countryMaximum: derived.countryPool.maximum,
      territoryMaximum: derived.territoryPool.maximum,
      sourceWorkbookSha256: metadata.workbook.sha256,
    };
    metadata.methodReference.status =
      "Model V1 is implemented offline for GDP per capita, as subsequently requested by the owner. The three original workbook metrics and their cached indices/medians remain unchanged. No index calculations run in the application.";
    for (const file of Object.keys(metadata.csvSha256))
      metadata.csvSha256[file] = createHash("sha256")
        .update(readFileSync(file))
        .digest("hex");
    writeFileSync(path, JSON.stringify(metadata, null, 2) + "\n");
  }
  console.log(
    `GDP per capita ${check ? "verified" : "stored"}: ${derived.countryPool.count} countries, ${derived.territoryPool.count} territories, 7 country median rows.`,
  );
}
