import type { CountrySeed, CountryStayPeriod } from "./countries";

export function exactDay(value: string): number {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    throw new Error("Stay periods require exact YYYY-MM-DD dates.");
  const day = Date.parse(value);
  if (
    !Number.isFinite(day) ||
    new Date(day).toISOString().slice(0, 10) !== value
  )
    throw new Error("Invalid stay period date.");
  return day / 86400000;
}
export function stayDays(
  period: Pick<CountryStayPeriod, "arrival" | "departure">,
) {
  const days = exactDay(period.departure) - exactDay(period.arrival) + 1;
  if (days < 1) throw new Error("Stay period departure is before arrival.");
  return days;
}

/** Validate actual stays independently of the enclosing visit's calendar span. */
export function calculateRecordedHistory(countries: CountrySeed[]) {
  for (const country of countries) {
    let previous: { end: number; visit: number } | undefined;
    let count = 0,
      days = 0;
    for (const visit of [...(country.visits ?? [])].sort(
      (a, b) => a.number - b.number,
    )) {
      const periods = [...(visit.periods ?? [])].sort(
        (a, b) => a.number - b.number,
      );
      if (!periods.length) continue;
      let spent = 0;
      for (const [index, period] of periods.entries()) {
        if (period.number !== index + 1)
          throw new Error(
            `${country.code}: period numbers must be consecutive.`,
          );
        const start = exactDay(period.arrival),
          end = exactDay(period.departure);
        spent += stayDays(period);
        if (previous) {
          const gap = start - previous.end;
          if (gap <= 0)
            throw new Error(
              `${country.code}: stay periods overlap or are out of order.`,
            );
          if ((previous.visit === visit.number) !== gap < 14)
            throw new Error(
              `${country.code}: visit grouping violates the 14-day rule.`,
            );
        }
        previous = { end, visit: visit.number };
      }
      if (
        visit.arrival !== periods[0].arrival ||
        visit.departure !== periods.at(-1)!.departure
      )
        throw new Error(
          `${country.code}: visit dates disagree with actual stay periods.`,
        );
      if (visit.daysSpent != null && visit.daysSpent !== spent)
        throw new Error(
          `${country.code}: visit days disagree with actual stay periods.`,
        );
      visit.daysSpent = spent;
      visit.periods = periods;
      count++;
      days += spent;
    }
    country.recordedVisits = count || null;
    country.recordedDaysSpent = count ? days : null;
  }
  return countries;
}
