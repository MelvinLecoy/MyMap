export const COUNTRY_METRICS = ["population", "area", "gdp"] as const;
export type CountryMetric = (typeof COUNTRY_METRICS)[number];
export interface ReferenceValue {
  value: number;
  year: number | null;
  source: string;
}
export interface CountryReference {
  code: string;
  name: string;
  continent: string;
  comparable: boolean;
  metrics: Record<CountryMetric, ReferenceValue | null>;
  facts: string[];
  cities: string[];
  attractions: { name: string; url: string }[];
  sources: { facts: string; cities: string; attractions: string };
}
export interface ReferenceSource {
  label: string;
  url: string;
}
export interface CountryReferenceData {
  countries: CountryReference[];
  sources: Record<string, ReferenceSource>;
}

const mean = (values: number[]) =>
  values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;

/** Build once from the frozen CSV bundle; filters never change the reference set. */
export function createCountryReferenceIndex(data: CountryReferenceData) {
  const comparable = data.countries.filter((country) => country.comparable);
  const benchmarks = Object.fromEntries(
    COUNTRY_METRICS.map((metric) => {
      const available = comparable.filter((country) => country.metrics[metric]);
      const values = available.map((country) => country.metrics[metric]!.value);
      const continents = new Map<string, number[]>();
      for (const country of available) {
        const list = continents.get(country.continent) ?? [];
        list.push(country.metrics[metric]!.value);
        continents.set(country.continent, list);
      }
      const leader =
        [...available].sort(
          (a, b) => b.metrics[metric]!.value - a.metrics[metric]!.value,
        )[0] ?? null;
      return [metric, { values, mean: mean(values), continents, leader }];
    }),
  ) as Record<
    CountryMetric,
    {
      values: number[];
      mean: number | null;
      continents: Map<string, number[]>;
      leader: CountryReference | null;
    }
  >;
  return {
    ...data,
    byCode: new Map(data.countries.map((country) => [country.code, country])),
    benchmarks,
  };
}
export type CountryReferenceIndex = ReturnType<
  typeof createCountryReferenceIndex
>;

/** Empirical midrank, on 1–100. It conveys standing, never a percentage of output. */
export function globalStanding(value: number, values: number[]) {
  if (!values.length || !Number.isFinite(value)) return null;
  const lower = values.filter((other) => other < value).length;
  const tied = values.filter((other) => other === value).length;
  if (values.length === 1) return 100;
  if (lower + tied === values.length) return 100;
  if (!lower) return 1;
  return Math.max(
    1,
    Math.min(
      100,
      1 + (99 * (lower + Math.max(0, tied - 1) / 2)) / (values.length - 1),
    ),
  );
}

export function countryMetricContext(
  index: CountryReferenceIndex,
  code: string,
  metric: CountryMetric,
) {
  const country = index.byCode.get(code);
  const reference = country?.metrics[metric] ?? null;
  const benchmark = index.benchmarks[metric];
  const continentValues =
    benchmark.continents.get(country?.continent ?? "") ?? [];
  return {
    reference,
    standing:
      country?.comparable && reference
        ? globalStanding(reference.value, benchmark.values)
        : null,
    worldAverage: benchmark.mean,
    continentAverage: mean(continentValues),
    worldCount: benchmark.values.length,
    continentCount: continentValues.length,
    leader: benchmark.leader,
  };
}

export function compactCountryValue(value: number) {
  const scales = [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
    [1, ""],
  ] as const;
  let index = scales.findIndex(([scale]) => value >= scale);
  if (index < 0) index = scales.length - 1;
  if (index > 0 && Math.round((value / scales[index][0]) * 100) / 100 >= 1000)
    index--;
  return {
    amount: (value / scales[index][0]).toFixed(2),
    suffix: scales[index][1],
  };
}
export function formatStanding(value: number) {
  return value < 1 ? value.toFixed(1) : String(Math.round(value));
}
