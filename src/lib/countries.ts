import type { City, CountryVisit, VisitStatus } from "./types";
import { VISIT_LABELS } from "./types";

export interface CountrySeed {
  code: string;
  name: string;
  continent: string;
  visit: string;
  is195?: boolean;
  aliases?: string[];
  visitHistoryComplete?: boolean;
  firstVisitOrder?: number | null;
  timesVisited?: number | null;
  totalDaysSpent?: number | null;
  notes?: string;
  visits?: CountryTrip[];
}
export interface CountryTrip {
  number: number;
  arrival: string | null;
  departure: string | null;
  daysSpent: number | null;
  notes?: string;
}
export interface CountryRecord extends Omit<CountrySeed, "visit"> {
  visit: VisitStatus;
  cityCount: number;
}

export function countryKey(city: Pick<City, "countryCode" | "country">) {
  return city.countryCode || city.country;
}
export function buildCountryRecords(
  seeds: CountrySeed[],
  cities: City[],
): CountryRecord[] {
  const counts = new Map<string, number>();
  const visited = new Set<string>();
  for (const city of cities) {
    const key = countryKey(city);
    counts.set(key, (counts.get(key) ?? 0) + 1);
    if (city.visit === "visited") visited.add(key);
  }
  return seeds
    .map((country) => ({
      ...country,
      visit: visited.has(country.code)
        ? ("visited" as const)
        : Object.hasOwn(VISIT_LABELS, country.visit)
          ? (country.visit as VisitStatus)
          : ("unknown" as const),
      cityCount: counts.get(country.code) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type CountrySet = 195 | 197;
export function inCountrySet(country: CountrySeed, set: CountrySet) {
  return set === 195 ? country.is195 === true : country.is195 !== undefined;
}
export function countryVisitOrders(countries: CountrySeed[], set: CountrySet) {
  return new Map(
    countries
      .filter(
        (country) =>
          inCountrySet(country, set) && country.firstVisitOrder != null,
      )
      .sort((a, b) => a.firstVisitOrder! - b.firstVisitOrder!)
      .map((country, index) => [country.code, index + 1]),
  );
}
export function mergeCountryVisits(
  initial: CountryVisit[],
  records: CountryRecord[],
): CountryVisit[] {
  const result = new Map(
    initial.map((country) => [country.code, { ...country }]),
  );
  for (const country of records) {
    const previous = result.get(country.code);
    result.set(country.code, {
      code: country.code,
      color: previous?.color ?? null,
      visited: Boolean(previous?.visited || country.visit === "visited"),
    });
  }
  return [...result.values()];
}

export function matchesVisit(visit: VisitStatus, filter: string) {
  return (
    filter === "all" ||
    (filter === "not-yet"
      ? visit === "unknown" || visit === "not-visited"
      : visit === filter)
  );
}
export function searchText(value: string) {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}
