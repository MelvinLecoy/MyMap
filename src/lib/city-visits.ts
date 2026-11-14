import { formatVisitDate, type CityStayPeriod, type CityVisit } from "./types";

export const CITY_VISIT_GAP_DAYS = 6;
const day = 86400000;
export function exactVisitDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))
    return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return (
    Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value
  );
}
const gap = (departure: string, arrival: string) =>
  (Date.parse(arrival) - Date.parse(departure)) / day;
function validStay(period: CityStayPeriod, number: number) {
  return (
    period.number === number &&
    exactVisitDate(period.arrival) &&
    exactVisitDate(period.departure) &&
    period.departure >= period.arrival &&
    typeof period.daysSpent === "number" &&
    Number.isFinite(period.daysSpent) &&
    period.daysSpent > 0 &&
    Number.isInteger(period.daysSpent * 2) &&
    period.daysSpent <= gap(period.arrival, period.departure) + 1
  );
}

/** Six or more calendar days from departure to the next arrival starts a visit. */
export function groupCityStays(
  stays: Omit<CityStayPeriod, "number">[],
): CityVisit[] {
  const sorted = [...stays].sort((a, b) => a.arrival.localeCompare(b.arrival));
  const visits: CityVisit[] = [];
  for (const stay of sorted) {
    if (!validStay({ ...stay, number: 1 }, 1))
      throw new Error("Invalid city stay: check dates and half-day durations.");
    const previous = visits.at(-1);
    if (previous && gap(previous.departure, stay.arrival) <= 0)
      throw new Error("Invalid city stay history: overlapping periods.");
    const period = {
      number: 1,
      arrival: stay.arrival,
      departure: stay.departure,
      daysSpent: stay.daysSpent,
    };
    if (
      !previous ||
      gap(previous.departure, stay.arrival) >= CITY_VISIT_GAP_DAYS
    ) {
      visits.push({ ...period, number: visits.length + 1, periods: [period] });
    } else {
      previous.periods!.push({
        ...period,
        number: previous.periods!.length + 1,
      });
      previous.departure = stay.departure;
      previous.daysSpent += stay.daysSpent;
    }
  }
  return visits;
}

export function validateCityVisits(visits: CityVisit[]): CityVisit[] {
  const sorted = [...visits].sort((a, b) => a.number - b.number);
  sorted.forEach((visit, i) => {
    const periods = visit.periods ?? [{ ...visit, number: 1 }];
    if (
      !validStay(visit, i + 1) ||
      !periods.length ||
      periods.some(
        (period, p) =>
          !validStay(period, p + 1) ||
          (p > 0 &&
            (gap(periods[p - 1].departure, period.arrival) <= 0 ||
              gap(periods[p - 1].departure, period.arrival) >=
                CITY_VISIT_GAP_DAYS)),
      ) ||
      visit.arrival !== periods[0].arrival ||
      visit.departure !== periods.at(-1)!.departure ||
      visit.daysSpent !== periods.reduce((n, p) => n + p.daysSpent, 0) ||
      (i > 0 &&
        gap(sorted[i - 1].departure, visit.arrival) < CITY_VISIT_GAP_DAYS)
    )
      throw new Error(
        "Invalid city visit history: check numbering, dates, overlap, six-day grouping and half-day durations.",
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
