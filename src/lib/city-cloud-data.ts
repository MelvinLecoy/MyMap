import { fromCityRow, type CityRow } from "./cloud-data";
import {
  cityVisitSummary,
  groupCityStays,
  validateCityVisits,
} from "./city-visits";
import type { City, CityVisit } from "./types";

export interface CityVisitRow {
  city_id: string;
  visit_number: number;
  arrival_date: string;
  departure_date: string;
  days_spent: number;
}
export interface CityPeriodRow extends CityVisitRow {
  period_number: number;
}
export interface CitySnapshot {
  cities: CityRow[];
  visits: CityVisitRow[];
  periods: CityPeriodRow[];
}
const visitRow = (city: City, visit: CityVisit): CityVisitRow => ({
  city_id: city.id,
  visit_number: visit.number,
  arrival_date: visit.arrival,
  departure_date: visit.departure,
  days_spent: visit.daysSpent,
});
export function toCityVisitRows(cities: City[]): CityVisitRow[] {
  return cities.flatMap((city) =>
    (city.visits ?? []).map((visit) => visitRow(city, visit)),
  );
}
export function toCityPeriodRows(cities: City[]): CityPeriodRow[] {
  return cities.flatMap((city) =>
    (city.visits ?? []).flatMap((visit) =>
      (visit.periods ?? [{ ...visit, number: 1 }]).map((period) => ({
        ...visitRow(city, period),
        visit_number: visit.number,
        period_number: period.number,
      })),
    ),
  );
}
/** Original chronological stays, used only for provenance and legacy upgrades. */
export function toCityStayRows(cities: City[]): CityVisitRow[] {
  return cities.flatMap((city) =>
    (city.visits ?? [])
      .flatMap((visit) => visit.periods ?? [visit])
      .map((period, i) => visitRow(city, { ...period, number: i + 1 })),
  );
}

export function attachCityVisits(
  cities: City[],
  rows: CityVisitRow[],
  periods?: CityPeriodRow[],
): City[] {
  const ids = new Set(cities.map((c) => c.id));
  if (ids.size !== cities.length) throw new Error("Duplicate city IDs.");
  const byCity = new Map<string, CityVisit[]>(),
    byVisit = new Map<string, CityVisit>();
  for (const row of rows) {
    if (!row || !ids.has(row.city_id))
      throw new Error("Visit history references an unknown city.");
    const key = `${row.city_id}:${row.visit_number}`;
    if (byVisit.has(key)) throw new Error("Duplicate city visit numbering.");
    const visit: CityVisit = {
      number: row.visit_number,
      arrival: row.arrival_date,
      departure: row.departure_date,
      daysSpent: row.days_spent,
      ...(periods ? { periods: [] } : {}),
    };
    byVisit.set(key, visit);
    const visits = byCity.get(row.city_id) ?? [];
    visits.push(visit);
    byCity.set(row.city_id, visits);
  }
  for (const row of periods ?? []) {
    const visit = row && byVisit.get(`${row.city_id}:${row.visit_number}`);
    if (!visit)
      throw new Error("City stay period references an unknown visit.");
    visit.periods!.push({
      number: row.period_number,
      arrival: row.arrival_date,
      departure: row.departure_date,
      daysSpent: row.days_spent,
    });
  }
  return cities.map((city) => {
    const visits = byCity.get(city.id);
    if (!visits) return city;
    // An older RPC supplies raw stays during the deployment transition.
    if (
      !periods &&
      [...visits]
        .sort((a, b) => a.number - b.number)
        .some((v, i) => v.number !== i + 1)
    )
      throw new Error("Invalid legacy city visit numbering.");
    for (const visit of visits)
      visit.periods?.sort((a, b) => a.number - b.number);
    const sorted = validateCityVisits(
      periods ? visits : groupCityStays(visits),
    );
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
    !Array.isArray(snapshot.visits) ||
    (snapshot.periods !== undefined && !Array.isArray(snapshot.periods))
  )
    throw new Error("Incomplete city snapshot.");
  const cities = attachCityVisits(
    snapshot.cities.map(fromCityRow),
    snapshot.visits,
    snapshot.periods,
  );
  return snapshot.periods !== undefined
    ? snapshot
    : {
        cities: snapshot.cities,
        visits: toCityVisitRows(cities),
        periods: toCityPeriodRows(cities),
      };
}

function exportHistory(cities: City[], periods: boolean): string {
  const cell = (value: unknown) =>
    `"${String(value ?? "").replaceAll('"', '""')}"`;
  return (
    [
      [
        "CityId",
        "Cities",
        "CountryCode",
        "VisitNumber",
        ...(periods ? ["PeriodNumber"] : []),
        "ArrivalDate",
        "DepartureDate",
        "DaysSpent",
      ],
      ...cities.flatMap((city) =>
        (city.visits ?? []).flatMap((v) =>
          (periods ? (v.periods ?? [{ ...v, number: 1 }]) : [v]).map((p) => [
            city.id,
            city.name,
            city.countryCode,
            v.number,
            ...(periods ? [p.number] : []),
            p.arrival,
            p.departure,
            p.daysSpent,
          ]),
        ),
      ),
    ]
      .map((row) => row.map(cell).join(","))
      .join("\r\n") + "\r\n"
  );
}
export const exportCityVisitsCsv = (cities: City[]) =>
  exportHistory(cities, false);
export const exportCityPeriodsCsv = (cities: City[]) =>
  exportHistory(cities, true);
