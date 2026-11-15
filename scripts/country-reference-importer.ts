import { readCSV } from "./importer";
import type { CountrySeed } from "../src/lib/countries";
import type {
  CountryReferenceData,
  ReferenceSource,
  ReferenceValue,
} from "../src/lib/country-reference";

export function importCountryReference(
  metricsCsv: string,
  mediansCsv: string,
  highlightsCsv: string,
  countries: CountrySeed[],
  sources: Record<string, ReferenceSource>,
  comparisonRegionsCsv = "",
): CountryReferenceData {
  const figures = (
    row: Record<string, string>,
    raw: string,
    index: string,
  ): ReferenceValue => {
    const number = (field: string, isIndex = false) => {
      if (row[field] === "") return null;
      const value = Number(row[field]);
      if (!Number.isFinite(value) || value < 0 || (isIndex && value > 100))
        throw new Error(`Invalid supplied country metric: ${field}`);
      return value;
    };
    const value = number(raw),
      score = number(index, true);
    if ((value === null) !== (score === null))
      throw new Error(
        "A supplied metric and its index must be available together.",
      );
    return { value, index: score };
  };
  const metricFields = (row: Record<string, string>) => ({
    population: figures(row, "population", "populationindex"),
    area: figures(row, "totalareakm2", "areaindex"),
    gdp: figures(row, "gdpusdbillions", "gdpindex"),
    gdpPerCapita: figures(row, "gdppercapitausd", "gdppercapitaindex"),
  });
  const metricRows = new Map<
    string,
    {
      name: string;
      category: "195" | "197" | "Territory";
      continent: string;
      metrics: ReturnType<typeof metricFields>;
    }
  >();
  for (const { values: row } of readCSV(metricsCsv, [
    "CountryCode",
    "Country",
    "Category",
    "Continent",
    "Population",
    "PopulationIndex",
    "TotalAreaKm2",
    "AreaIndex",
    "GdpUsdBillions",
    "GdpIndex",
    "GdpPerCapitaUsd",
    "GdpPerCapitaIndex",
  ])) {
    if (
      !/^[A-Z]{2}$/.test(row.countrycode) ||
      metricRows.has(row.countrycode) ||
      !row.country ||
      !["195", "197", "Territory"].includes(row.category)
    )
      throw new Error(
        `Unknown or duplicate country reference: ${row.countrycode}`,
      );
    metricRows.set(row.countrycode, {
      name: row.country,
      category: row.category as "195" | "197" | "Territory",
      continent: row.continent,
      metrics: metricFields(row),
    });
  }
  const medians: CountryReferenceData["medians"] = {};
  const regions = [
    "Global",
    "Africa",
    "Asia",
    "Europe",
    "North America",
    "South America",
    "Oceania",
  ];
  for (const { values: row } of readCSV(mediansCsv, [
    "Region",
    "Countries",
    "GdpUsdBillions",
    "GdpIndex",
    "Population",
    "PopulationIndex",
    "TotalAreaKm2",
    "AreaIndex",
    "GdpPerCapitaUsd",
    "GdpPerCapitaIndex",
  ])) {
    const count = Number(row.countries);
    if (
      !regions.includes(row.region) ||
      medians[row.region] ||
      !Number.isInteger(count) ||
      count <= 0
    )
      throw new Error("Invalid supplied median region or country count.");
    medians[row.region] = { count, metrics: metricFields(row) };
  }
  if (regions.some((region) => !medians[region]))
    throw new Error("Supplied median coverage is incomplete.");

  const comparisonRegions = new Map<string, string>();
  if (comparisonRegionsCsv) {
    for (const { values: row } of readCSV(comparisonRegionsCsv, [
      "CountryCode",
      "MedianRegion",
    ])) {
      if (
        !metricRows.has(row.countrycode) ||
        comparisonRegions.has(row.countrycode) ||
        !countries.some((country) => country.code === row.countrycode) ||
        !regions.slice(1).includes(row.medianregion)
      )
        throw new Error("Invalid or duplicate country comparison region.");
      comparisonRegions.set(row.countrycode, row.medianregion);
    }
  }

  const highlights = new Map<string, Record<string, string>>();
  for (const { values: row } of readCSV(highlightsCsv, [
    "CountryCode",
    "FactsSource",
    "CitiesSource",
    "AttractionsSource",
    ...["Fact", "City", "Attraction"].flatMap((field) =>
      [1, 2, 3].map((i) => field + i),
    ),
    ...[1, 2, 3].map((i) => `Attraction${i}Url`),
  ])) {
    if (
      highlights.has(row.countrycode) ||
      !countries.some((country) => country.code === row.countrycode)
    )
      throw new Error(
        `Unknown or duplicate country highlights: ${row.countrycode}`,
      );
    highlights.set(row.countrycode, row);
  }
  if (highlights.size !== countries.length)
    throw new Error("Country highlights coverage is incomplete.");
  const source = (key: string) => {
    if (!sources[key])
      throw new Error(`Unknown country reference source: ${key}`);
    if (new URL(sources[key].url).protocol !== "https:")
      throw new Error("Reference sources must use HTTPS.");
    return key;
  };
  return {
    sources,
    medians,
    countries: countries.map((country) => {
      const supplied = metricRows.get(country.code),
        h = highlights.get(country.code)!;
      if (!supplied)
        throw new Error(`Missing supplied country metrics: ${country.code}`);
      // The owner explicitly excluded Svalbard: the workbook's SJ row also includes Jan Mayen.
      const excluded = country.code === "SJ";
      const list = (field: string, exact = true) => {
        const values = [1, 2, 3].map((i) => h[field + i]).filter(Boolean);
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
      return {
        code: country.code,
        name: country.name,
        continent: excluded ? country.continent : supplied.continent,
        medianRegion: comparisonRegions.get(country.code),
        category: excluded ? null : supplied.category,
        metrics: excluded
          ? {
              population: { value: null, index: null },
              area: { value: null, index: null },
              gdp: { value: null, index: null },
              gdpPerCapita: { value: null, index: null },
            }
          : supplied.metrics,
        facts: list("fact"),
        cities: list("city", false),
        attractions: list("attraction").map((name, i) => {
          const url = h[`attraction${i + 1}url`];
          if (new URL(url).protocol !== "https:")
            throw new Error("Attraction sources must use HTTPS.");
          return { name, url };
        }),
        sources: {
          facts: source(h.factssource),
          cities: source(h.citiessource),
          attractions: source(h.attractionssource),
        },
      };
    }),
  };
}
