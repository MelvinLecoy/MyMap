import { formatVisitDate, type CityVisit } from "./types";

export function exactVisitDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}

export function validateCityVisits(visits: CityVisit[]): CityVisit[] {
  const sorted = [...visits].sort((a, b) => a.number - b.number);
  sorted.forEach((visit, i) => {
    if (
      visit.number !== i + 1 ||
      !exactVisitDate(visit.arrival) ||
      !exactVisitDate(visit.departure) ||
      visit.departure < visit.arrival ||
      typeof visit.daysSpent !== "number" ||
      !Number.isFinite(visit.daysSpent) ||
      visit.daysSpent <= 0 ||
      !Number.isInteger(visit.daysSpent * 2) ||
      visit.daysSpent >
        (Date.parse(visit.departure) - Date.parse(visit.arrival)) / 86400000 +
          1 ||
      (i > 0 && sorted[i - 1].departure >= visit.arrival)
    )
      throw new Error(
        "Invalid city visit history: check numbering, dates, overlap and half-day durations.",
      );
  });
  return sorted;
}

export function cityVisitSummary(visits: CityVisit[]) {
  return {
    visits: visits.length,
    days: visits.reduce((n, visit) => n + visit.daysSpent, 0),
    lastVisited: visits.reduce<string | null>(
      (date, visit) =>
        !date || visit.departure > date ? visit.departure : date,
      null,
    ),
  };
}

export function formatCityVisitRange(visit: CityVisit): string {
  if (visit.arrival === visit.departure) return formatVisitDate(visit.arrival);
  const arrival =
    visit.arrival.slice(0, 7) === visit.departure.slice(0, 7)
      ? String(Number(visit.arrival.slice(8)))
      : formatVisitDate(visit.arrival);
  return `${arrival} – ${formatVisitDate(visit.departure)}`;
}
