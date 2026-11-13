/** Explain only explicit durations that differ from the inclusive date span. */
export function visitDurationAnnotation(
  arrival: string | null,
  departure: string | null,
  days: number | null | undefined,
): string {
  if (
    days == null ||
    !arrival ||
    !departure ||
    arrival.length !== 10 ||
    departure.length !== 10
  )
    return "";
  const span = (Date.parse(departure) - Date.parse(arrival)) / 86400000 + 1;
  return Number.isFinite(span) && span > 0 && days !== span
    ? ` (${days} ${days === 1 ? "day" : "days"})`
    : "";
}
