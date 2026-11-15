import { readCSV } from "./importer";
import type { CountrySeed } from "../src/lib/countries";
import type {
  CountryReferenceData,
  ReferenceSource,
  ReferenceValue,
} from "../src/lib/country-reference";

export function importCountryReference(
  metrics: string,
  highlights: string,
  countries: CountrySeed[],
  sources: Record<string, ReferenceSource>,
): CountryReferenceData {
  const rows = (text: string, required: string[]) => {
    const byCode = new Map<string, Record<string, string>>();
    for (const { values } of readCSV(text, ["CountryCode", ...required])) {
      if (
        byCode.has(values.countrycode) ||
        !countries.some((c) => c.code === values.countrycode)
      )
        throw new Error(
          `Unknown or duplicate country reference: ${values.countrycode}`,
        );
      byCode.set(values.countrycode, values);
    }
    if (byCode.size !== countries.length)
      throw new Error("Country reference coverage is incomplete.");
    return byCode;
  };
  const source = (key: string) => {
    if (!sources[key])
      throw new Error(`Unknown country reference source: ${key}`);
    const url = new URL(sources[key].url);
    if (url.protocol !== "https:")
      throw new Error("Reference sources must use HTTPS.");
    return key;
  };
  const metricRows = rows(metrics, [
      "CompareGlobally",
      "Population",
      "PopulationYear",
      "PopulationSource",
      "TotalAreaKm2",
      "AreaSource",
      "GdpUsd",
      "GdpUsdYear",
      "GdpUsdSource",
    ]),
    highlightRows = rows(highlights, [
      "FactsSource",
      "CitiesSource",
      "AttractionsSource",
      ...["Fact", "City", "Attraction"].flatMap((field) =>
        [1, 2, 3].map((i) => field + i),
      ),
      ...[1, 2, 3].map((i) => `Attraction${i}Url`),
    ]);
  return {
    sources,
    countries: countries.map((country) => {
      const row = metricRows.get(country.code)!,
        h = highlightRows.get(country.code)!;
      if (!["0", "1"].includes(row.compareglobally))
        throw new Error("Country comparison eligibility must be 0 or 1.");
      const value = (
        field: string,
        yearField: string,
        sourceField: string,
      ): ReferenceValue | null => {
        if (!row[field]) {
          if (row[yearField] || row[sourceField])
            throw new Error(
              "An unavailable metric cannot have a year or source.",
            );
          return null;
        }
        const number = Number(row[field]),
          year = row[yearField] ? Number(row[yearField]) : null;
        if (
          !Number.isFinite(number) ||
          number <= 0 ||
          (year !== null &&
            (!Number.isInteger(year) ||
              year < 1900 ||
              year > new Date().getUTCFullYear()))
        )
          throw new Error(
            `Invalid country reference value: ${country.code} ${field}`,
          );
        return { value: number, year, source: source(row[sourceField]) };
      };
      const list = (field: string, exact = true) => {
        const values = [1, 2, 3]
          .map((position) => h[field + position])
          .filter(Boolean);
        if (
          !values.length ||
          (exact && values.length !== 3) ||
          new Set(values).size !== values.length
        )
          throw new Error(
            `Invalid country highlights: ${country.code} ${field}`,
          );
        return values;
      };
      const attractions = list("attraction").map((name, i) => {
        const url = h[`attraction${i + 1}url`];
        if (new URL(url).protocol !== "https:")
          throw new Error("Attraction sources must use HTTPS.");
        return { name, url };
      });
      return {
        code: country.code,
        name: country.name,
        continent: country.continent,
        comparable: row.compareglobally === "1",
        metrics: {
          population: value("population", "populationyear", "populationsource"),
          area: value("totalareakm2", "areayear", "areasource"),
          gdp: value("gdpusd", "gdpusdyear", "gdpusdsource"),
        },
        facts: list("fact"),
        cities: list("city", false),
        attractions,
        sources: {
          facts: source(h.factssource),
          cities: source(h.citiessource),
          attractions: source(h.attractionssource),
        },
      };
    }),
  };
}
