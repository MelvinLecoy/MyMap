import { fromCityRow, type CityRow } from "./cloud-data";
import { cityVisitSummary, validateCityVisits } from "./city-visits";
import type { City, CityVisit } from "./types";

export interface CityVisitRow {
  city_id: string;
  visit_number: number;
  arrival_date: string;
  departure_date: string;
  days_spent: number;
}
export interface CitySnapshot {
  cities: CityRow[];
  visits: CityVisitRow[];
}

export function toCityVisitRows(cities: City[]): CityVisitRow[] {
  return cities.flatMap((city) =>
    (city.visits ?? []).map((visit) => ({
      city_id: city.id,
      visit_number: visit.number,
      arrival_date: visit.arrival,
      departure_date: visit.departure,
      days_spent: visit.daysSpent,
    })),
  );
}

export function attachCityVisits(cities: City[], rows: CityVisitRow[]): City[] {
  const ids = new Set(cities.map((c) => c.id));
  if (ids.size !== cities.length) throw new Error("Duplicate city IDs.");
  const byCity = new Map<string, CityVisit[]>();
  for (const row of rows) {
    if (!row || !ids.has(row.city_id))
      throw new Error("Visit history references an unknown city.");
    const visits = byCity.get(row.city_id) ?? [];
    visits.push({
      number: row.visit_number,
      arrival: row.arrival_date,
      departure: row.departure_date,
      daysSpent: row.days_spent,
    });
    byCity.set(row.city_id, visits);
  }
  return cities.map((city) => {
    const visits = byCity.get(city.id);
    if (!visits) return city;
    const sorted = validateCityVisits(visits);
    if (
      city.visit !== "visited" ||
      city.lastVisited !== cityVisitSummary(sorted).lastVisited
    )
      throw new Error(`City visit summary differs from history: ${city.id}`);
    return { ...city, visits: sorted };
  });
}

export function readCitySnapshot(value: unknown): CitySnapshot {
  if (!value || typeof value !== "object")
    throw new Error("Invalid city snapshot.");
  const snapshot = value as CitySnapshot;
  if (
    !Array.isArray(snapshot.cities) ||
    !snapshot.cities.length ||
    !Array.isArray(snapshot.visits)
  )
    throw new Error("Incomplete city snapshot.");
  attachCityVisits(snapshot.cities.map(fromCityRow), snapshot.visits);
  return snapshot;
}

export function exportCityVisitsCsv(cities: City[]): string {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    [
      [
        "CityId",
        "Cities",
        "CountryCode",
        "VisitNumber",
        "ArrivalDate",
        "DepartureDate",
        "DaysSpent",
      ],
      ...cities.flatMap((city) =>
        (city.visits ?? []).map((v) => [
          city.id,
          city.name,
          city.countryCode,
          v.number,
          v.arrival,
          v.departure,
          v.daysSpent,
        ]),
      ),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
