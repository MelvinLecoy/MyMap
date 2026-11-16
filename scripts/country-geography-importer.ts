import type { CountrySeed } from "../src/lib/countries";
import type { CountryGeography } from "../src/lib/country-geography";
import { readCSV } from "./importer";

const CONTINENTS = new Set([
  "Africa",
  "Asia",
  "Europe",
  "North America",
  "South America",
  "Oceania",
]);

/** Validate the complete country table; territories have no inferred taxonomy. */
export function importCountryGeography(
  csv: string,
  countries: Pick<CountrySeed, "code" | "name" | "is195">[],
): CountryGeography[] {
  const expected = new Map(
    countries
      .filter((country) => country.is195 !== undefined)
      .map((country) => [country.code, country]),
  );
  const headers = [
    "CountryCode",
    "Country",
    "Continent",
    "Region",
    "Subregion",
  ];
  const seen = new Set<string>();
  const rows = readCSV(csv, headers).map(({ values: row, line }) => {
    const code = row.countrycode;
    const country = expected.get(code);
    if (Object.keys(row).length !== headers.length)
      throw new Error(`Country geography row ${line}: unexpected columns.`);
    if (!/^[A-Z]{2}$/.test(code) || !country || seen.has(code))
      throw new Error(
        `Country geography row ${line}: unknown or duplicate country ${code}.`,
      );
    if (country.name !== row.country)
      throw new Error(
        `Country geography row ${line}: country name does not match ${code}.`,
      );
    if (!CONTINENTS.has(row.continent))
      throw new Error(`Country geography row ${line}: invalid continent.`);
    if (row.subregion && !row.region)
      throw new Error(
        `Country geography row ${line}: a subregion requires its parent region.`,
      );
    seen.add(code);
    return {
      code,
      name: row.country,
      continent: row.continent,
      region: row.region,
      subregion: row.subregion,
    };
  });
  const missing = [...expected.keys()].filter((code) => !seen.has(code));
  if (missing.length)
    throw new Error(`Country geography is incomplete: ${missing.join(", ")}.`);
  return rows;
}
