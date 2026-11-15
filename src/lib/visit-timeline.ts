import { exactVisitDate } from "./city-visits";
import { formatVisitDate } from "./types";
import { visitDurationAnnotation } from "./visit-duration";
import { VISIT_YEAR_COLORS } from "./palette";

export interface HistoryStay {
  number: number;
  arrival: string | null;
  departure: string | null;
  daysSpent?: number | null;
}
export interface HistoryVisit extends HistoryStay {
  periods?: HistoryStay[];
}
export interface TimelineCity {
  id: string;
  name: string;
}
export interface HistoryCity extends TimelineCity {
  visits?: readonly HistoryVisit[];
}
export interface TimelineStay extends HistoryStay {
  days: number | null;
  exceptional: boolean;
  exact: boolean;
  single: boolean;
  monthDates: boolean;
  range: string;
  startLabel: string;
  endLabel: string;
  precedingGap: boolean;
  cities: TimelineCity[];
}
export interface TimelineMonth {
  key: string;
  labels: string[];
  periods: TimelineStay[];
}
export interface TimelineEntry {
  number: number;
  days: number | null;
  months: TimelineMonth[];
}
export interface TimelineYear {
  year: string | null;
  color: string;
  visits: TimelineEntry[];
}
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const month = (date: string | null) =>
  date?.length && date.length >= 7
    ? months[Number(date.slice(5, 7)) - 1]
    : null;

export function historyDateRange(stay: HistoryStay) {
  const { arrival, departure } = stay;
  if (arrival && departure && arrival !== departure) {
    let start = formatVisitDate(arrival);
    if (
      exactVisitDate(arrival) &&
      exactVisitDate(departure) &&
      arrival.slice(0, 7) === departure.slice(0, 7)
    )
      start = String(Number(arrival.slice(8)));
    else if (arrival.slice(0, 4) === departure.slice(0, 4))
      start = start.replace(/ \d{4}$/, "");
    return `${start} – ${formatVisitDate(departure)}`;
  }
  if (arrival)
    return `${formatVisitDate(arrival)}${departure ? "" : " · Departure not recorded"}`;
  if (departure) return `Arrival not recorded · ${formatVisitDate(departure)}`;
  return "Dates not recorded";
}

/** Presentation only: preserve counted visits and periods; never regroup or add gap days. */
export function visitTimelineYears(
  visits: readonly HistoryVisit[],
  cities: readonly HistoryCity[] = [],
): TimelineYear[] {
  const cityStays = cities
    .flatMap((city) =>
      (city.visits ?? []).flatMap((visit) =>
        (visit.periods?.length ? visit.periods : [visit]).flatMap((stay) =>
          exactVisitDate(stay.arrival) && exactVisitDate(stay.departure)
            ? [
                {
                  id: city.id,
                  name: city.name,
                  arrival: stay.arrival,
                  departure: stay.departure,
                },
              ]
            : [],
        ),
      ),
    )
    .sort(
      (a, b) =>
        a.arrival.localeCompare(b.arrival) || a.name.localeCompare(b.name),
    );
  const grouped = new Map<string, TimelineYear>();
  const ordered = visits
    .map((visit) => ({
      visit,
      latest:
        [
          visit.arrival,
          visit.departure,
          ...(visit.periods ?? []).flatMap((stay) => [
            stay.arrival,
            stay.departure,
          ]),
        ]
          .filter((date): date is string => Boolean(date))
          .sort()
          .at(-1) ?? "",
    }))
    .sort(
      (a, b) =>
        b.latest.localeCompare(a.latest) || b.visit.number - a.visit.number,
    );
  for (const { visit, latest } of ordered) {
    const year = latest ? latest.slice(0, 4) : null;
    const key = year ?? "unknown";
    if (!grouped.has(key))
      grouped.set(key, {
        year,
        color: year
          ? (VISIT_YEAR_COLORS[Number(year) <= 2023 ? "2023" : year] ??
            VISIT_YEAR_COLORS["2026"])
          : "var(--muted)",
        visits: [],
      });
    const stays = [...(visit.periods?.length ? visit.periods : [visit])].sort(
      (a, b) =>
        (a.arrival ?? a.departure ?? "").localeCompare(
          b.arrival ?? b.departure ?? "",
        ) || a.number - b.number,
    );
    const dated = stays
      .flatMap((stay) => [stay.arrival, stay.departure])
      .filter((date): date is string => Boolean(date && month(date)))
      .sort();
    const firstDate = dated[0] ?? null;
    const lastDate = dated.at(-1) ?? null;
    const crossMonth = firstDate?.slice(0, 7) !== lastDate?.slice(0, 7);
    const crossYear = firstDate?.slice(0, 4) !== lastDate?.slice(0, 4);
    const labels = [
      ...new Set(
        [month(lastDate), month(firstDate)].filter((value): value is string =>
          Boolean(value),
        ),
      ),
    ].map((value) => value.toUpperCase());
    const row: TimelineMonth = {
      key: `${firstDate?.slice(0, 7) ?? ""}/${lastDate?.slice(0, 7) ?? ""}`,
      labels: labels.length ? labels : ["DATE"],
      periods: [],
    };
    const labeledMonths = new Set<string>();
    stays.forEach((stay, i) => {
      const supplied =
        stay.daysSpent ?? (stays.length === 1 ? visit.daysSpent : null);
      const exact =
        exactVisitDate(stay.arrival) && exactVisitDate(stay.departure);
      const matchingCities = new Map<string, TimelineCity>();
      if (exact)
        for (const city of cityStays)
          if (
            city.arrival <= stay.departure! &&
            city.departure >= stay.arrival!
          )
            matchingCities.set(city.id, { id: city.id, name: city.name });
      const days =
        supplied ??
        (exact
          ? (Date.parse(stay.departure!) - Date.parse(stay.arrival!)) /
              86400000 +
            1
          : null);
      const exceptional = Boolean(
        visitDurationAnnotation(stay.arrival, stay.departure, supplied),
      );
      const endpoint = (date: string | null) => {
        if (!exact || !date) return { label: "", monthDates: false };
        const key = date.slice(0, 7);
        const monthDates = crossMonth && !labeledMonths.has(key);
        labeledMonths.add(key);
        return {
          label: `${Number(date.slice(8))}${monthDates ? ` ${month(date)}` : ""}${monthDates && crossYear ? ` ’${date.slice(2, 4)}` : ""}`,
          monthDates,
        };
      };
      const start = endpoint(stay.arrival);
      const end =
        stay.arrival === stay.departure ? start : endpoint(stay.departure);
      row.periods.push({
        ...stay,
        days,
        exceptional,
        exact,
        single: stay.arrival === stay.departure,
        monthDates: start.monthDates || end.monthDates,
        range: historyDateRange(stay),
        startLabel: start.label,
        endLabel: end.label,
        precedingGap: i > 0,
        cities: [...matchingCities.values()],
      });
    });
    grouped.get(key)!.visits.push({
      number: visit.number,
      days: visit.daysSpent ?? null,
      months: [row],
    });
  }
  return [...grouped.values()];
}
