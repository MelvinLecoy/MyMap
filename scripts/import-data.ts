import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { importCities } from "./importer.js";
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
  const { data, issues } = importCities(
    readFileSync(demo ? "fixtures/cities.demo.csv" : "data/cities.csv", "utf8"),
    {
      demo,
      coordinates: demo ? undefined : optional("data/coordinates.csv"),
      countryVisits: optional(
        demo ? "fixtures/country-visits.demo.csv" : "data/country-visits.csv",
      ),
    },
  );
  mkdirSync("src/generated", { recursive: true });
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
