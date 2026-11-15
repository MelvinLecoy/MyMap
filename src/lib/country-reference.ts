export const COUNTRY_METRICS = [
  "population",
  "area",
  "gdp",
  "gdpPerCapita",
] as const;
export type CountryMetric = (typeof COUNTRY_METRICS)[number];
export interface ReferenceValue {
  value: number | null;
  index: number | null;
}
export interface CountryReference {
  code: string;
  name: string;
  continent: string;
  category: "195" | "197" | "Territory" | null;
  metrics: Record<CountryMetric, ReferenceValue>;
  facts: string[];
  cities: string[];
  attractions: { name: string; url: string }[];
  sources: { facts: string; cities: string; attractions: string };
}
export interface ReferenceSource {
  label: string;
  url: string;
}
export interface ReferenceMedian {
  count: number;
  metrics: Record<CountryMetric, ReferenceValue>;
}
export interface CountryReferenceData {
  countries: CountryReference[];
  medians: Record<string, ReferenceMedian>;
  sources: Record<string, ReferenceSource>;
}

/** Static lookups only. All figures, indices and medians are prepared in CSV. */
export function createCountryReferenceLookup(data: CountryReferenceData) {
  return {
    ...data,
    byCode: new Map(data.countries.map((country) => [country.code, country])),
  };
}
export type CountryReferenceLookup = ReturnType<
  typeof createCountryReferenceLookup
>;

export function countryMetricContext(
  data: CountryReferenceLookup,
  code: string,
  metric: CountryMetric,
) {
  const country = data.byCode.get(code);
  const countryPool =
    country?.category === "195" || country?.category === "197";
  const global = countryPool ? data.medians.Global?.metrics[metric] : null;
  const continental = countryPool
    ? data.medians[country!.continent]?.metrics[metric]
    : null;
  return {
    value: country?.metrics[metric].value ?? null,
    index: country?.metrics[metric].index ?? null,
    worldMedian: global?.value ?? null,
    continentalMedian: continental?.value ?? null,
    worldMedianIndex: global?.index ?? null,
    continentalMedianIndex: continental?.index ?? null,
    continent: country?.continent ?? "",
  };
}

function smartRounded(value: number) {
  if (value === 0) return "0";
  if (value < 1)
    return Number(value.toPrecision(2)).toLocaleString("en", {
      maximumFractionDigits: 12,
    });
  if (value >= 100) return Math.round(value).toLocaleString("en");
  const hundredth = Math.floor(value * 100 + 1e-7) % 10;
  return value.toLocaleString("en", {
    maximumFractionDigits: hundredth >= 3 && hundredth <= 7 ? 2 : 1,
  });
}

/** GDP is supplied in billions and always stays in B, including trillion-sized economies. */
export function formatCountryValue(
  metric: CountryMetric,
  value: number,
  fixedDecimals?: number,
) {
  if (metric === "gdp") return { amount: smartRounded(value), suffix: "B" };
  const scales =
    metric === "area"
      ? ([
          [1e6, "M"],
          [1e3, "K"],
          [1, ""],
        ] as const)
      : ([
          [1e9, "B"],
          [1e6, "M"],
          [1e3, "K"],
          [1, ""],
        ] as const);
  let position = scales.findIndex(([scale]) => value >= scale);
  if (position < 0) position = scales.length - 1;
  return {
    amount:
      fixedDecimals === undefined
        ? smartRounded(value / scales[position][0])
        : (value / scales[position][0]).toFixed(fixedDecimals),
    suffix: scales[position][1],
  };
}

export const formatMetricIndex = (value: number) => value.toFixed(1);

export function continentMedianLabel(continent: string) {
  const shortNames: Record<string, string> = {
    Africa: "AF",
    Asia: "AS",
    Europe: "EU",
    "North America": "NA",
    "South America": "SA",
    Oceania: "OC",
    Antarctica: "AN",
  };
  return `${shortNames[continent] ?? "Cont."} med.`;
}
