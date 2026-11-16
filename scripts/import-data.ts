import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importCities, readCSV } from "./importer.js";
import { importCountryHistory } from "./country-importer.js";
import countryStarter from "../data/countries.sample.json";
import { importPlaces } from "./place-importer";
import { importCountryReference } from "./country-reference-importer";
import countryReferenceSources from "../data/sources/country-reference.json";
import { importCountryGeography } from "./country-geography-importer";
const demo =
  process.argv.includes("--demo") ||
  (process.argv.includes("--demo-fallback") && !existsSync("data/cities.csv"));
if (!demo && !existsSync("data/cities.csv")) {
  console.error(
    "Missing data/cities.csv. Add your CSV export there, then run npm run build. To build the sample collection, run npm run build:demo.",
  );
  process.exit(1);
}
try {
  const optional = (path: string) =>
    existsSync(path) ? readFileSync(path, "utf8") : undefined;
  const geography = importCountryGeography(
    readFileSync("data/reference/country-geography.csv", "utf8"),
    readCSV(readFileSync("data/countries.csv", "utf8"), [
      "CountryCode",
      "Country",
      "Is195",
    ]).map(({ values: row }) => ({
      code: row.countrycode,
      name: row.country,
      is195: row.is195 === "1",
    })),
  );
  const { data, issues } = importCities(
    readFileSync(demo ? "fixtures/cities.demo.csv" : "data/cities.csv", "utf8"),
    {
      demo,
      coordinates: demo ? undefined : optional("data/coordinates.csv"),
      countryVisits: optional(
        demo ? "fixtures/country-visits.demo.csv" : "data/country-visits.csv",
      ),
      cityVisits: demo
        ? undefined
        : readFileSync("data/city-visit-history.csv", "utf8"),
      cityPeriods: demo
        ? undefined
        : readFileSync("data/city-visit-periods.csv", "utf8"),
      countryGeography: geography,
    },
  );
  mkdirSync("src/generated", { recursive: true });
  const countryHistory = demo
    ? countryStarter.countries
    : importCountryHistory(
        readFileSync("data/countries.csv", "utf8"),
        readFileSync("data/country-visit-history.csv", "utf8"),
        countryStarter.countries,
        readFileSync("data/country-visit-periods.csv", "utf8"),
      );
  if (!demo) {
    data.places = importPlaces(
      readFileSync("data/places.csv", "utf8"),
      readFileSync("data/place-countries.csv", "utf8"),
      countryHistory,
    );
    if (
      data.places.some((place) =>
        data.cities.some((city) => city.id === place.id),
      )
    )
      throw new Error("City and place IDs must be distinct.");
  }
  writeFileSync(
    "src/generated/country-geography.json",
    JSON.stringify({ countries: geography }) + "\n",
  );
  writeFileSync(
    "src/generated/countries.json",
    JSON.stringify({ sample: demo, countries: countryHistory }, null, 2) + "\n",
  );
  writeFileSync(
    "src/generated/country-reference.json",
    JSON.stringify(
      importCountryReference(
        readFileSync("data/country-metrics.csv", "utf8"),
        readFileSync("data/country-metric-medians.csv", "utf8"),
        readFileSync("data/country-highlights.csv", "utf8"),
        // Published reference coverage is independent of the demo collection.
        demo
          ? [
              ...geography.map(({ code, name, continent }) => ({
                code,
                name,
                continent,
                visit: "unknown",
              })),
              ...countryStarter.countries.filter(
                (country) =>
                  !geography.some((row) => row.code === country.code),
              ),
            ]
          : countryHistory,
        countryReferenceSources.sources,
        readFileSync("data/country-comparison-regions.csv", "utf8"),
      ),
    ) + "\n",
  );
  writeFileSync(
    "src/generated/atlas.json",
    JSON.stringify(data, null, 2) + "\n",
  );
  mkdirSync(".cache", { recursive: true });
  writeFileSync(
    ".cache/import-diagnostics.json",
    JSON.stringify(issues, null, 2) + "\n",
  );
  for (const issue of issues)
    console.warn(`Row ${issue.line}: ${issue.message}`);
  console.log(
    `Imported ${data.cities.length} cities (${data.demo ? "SAMPLE COLLECTION" : "your collection"}), ${issues.length} warnings.`,
  );
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
