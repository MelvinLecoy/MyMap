import type { City, VisitStatus } from "./types";
import { VISIT_LABELS } from "./types";

export interface CountrySeed {
  code: string;
  name: string;
  continent: string;
  visit: string;
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
  for (const city of cities) {
    const key = countryKey(city);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return seeds
    .map((country) => ({
      ...country,
      visit: Object.hasOwn(VISIT_LABELS, country.visit)
        ? (country.visit as VisitStatus)
        : ("unknown" as const),
      cityCount: counts.get(country.code) ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
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
