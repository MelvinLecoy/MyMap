import type { CountrySeed } from "./countries";
import { calculateRecordedHistory, validHalfDays } from "./country-history";

export interface CountrySnapshot {
  countries: {
    code: string;
    name: string;
    continent: string;
    is_195: boolean | null;
    visit_status: string;
    first_visit_order: number | null;
    times_visited: number | null;
    total_days_spent: number | null;
    visit_history_complete: boolean;
    notes: string;
    aliases: string[];
  }[];
  visits: {
    country_code: string;
    visit_number: number;
    arrival_date: string | null;
    departure_date: string | null;
    days_spent: number | null;
    notes: string;
  }[];
  periods: {
    country_code: string;
    visit_number: number;
    period_number: number;
    arrival_date: string;
    departure_date: string;
    days_spent?: number | null;
    source_refs: string;
    notes: string;
  }[];
}
export function toCountrySnapshot(countries: CountrySeed[]): CountrySnapshot {
  return {
    countries: countries.map((c) => ({
      code: c.code,
      name: c.name,
      continent: c.continent,
      is_195: c.is195 ?? null,
      visit_status: c.visit,
      first_visit_order: c.firstVisitOrder ?? null,
      times_visited: c.timesVisited ?? null,
      total_days_spent: c.totalDaysSpent ?? null,
      visit_history_complete: c.visitHistoryComplete ?? false,
      notes: c.notes ?? "",
      aliases: c.aliases ?? [],
    })),
    visits: countries.flatMap((c) =>
      (c.visits ?? []).map((v) => ({
        country_code: c.code,
        visit_number: v.number,
        arrival_date: v.arrival,
        departure_date: v.departure,
        days_spent: v.daysSpent,
        notes: v.notes ?? "",
      })),
    ),
    periods: countries.flatMap((c) =>
      (c.visits ?? []).flatMap((v) =>
        (v.periods ?? []).map((p) => ({
          country_code: c.code,
          visit_number: v.number,
          period_number: p.number,
          arrival_date: p.arrival,
          departure_date: p.departure,
          days_spent: p.daysSpent ?? null,
          source_refs: p.sourceRefs ?? "",
          notes: p.notes ?? "",
        })),
      ),
    ),
  };
}

export function fromCountrySnapshot(value: unknown): CountrySeed[] {
  const s = value as CountrySnapshot;
  if (
    !s ||
    !Array.isArray(s.countries) ||
    !s.countries.length ||
    !Array.isArray(s.visits) ||
    !Array.isArray(s.periods)
  )
    throw new Error("Invalid country snapshot.");
  const map = new Map<string, CountrySeed>();
  const whole = (n: unknown, min = 0) =>
    n === null || (Number.isSafeInteger(n) && Number(n) >= min);
  const date = (d: unknown) =>
    d === null ||
    (typeof d === "string" &&
      /^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(d) &&
      Number.isFinite(Date.parse(d)) &&
      new Date(Date.parse(d)).toISOString().startsWith(d));
  const orders = new Set<number>();
  for (const c of s.countries) {
    if (
      !c ||
      typeof c.code !== "string" ||
      !/^[A-Z]{2}$/.test(c.code) ||
      map.has(c.code) ||
      typeof c.name !== "string" ||
      !c.name ||
      typeof c.continent !== "string" ||
      !c.continent ||
      ![true, false, null].includes(c.is_195) ||
      !["visited", "planned", "not-visited", "unknown"].includes(
        c.visit_status,
      ) ||
      !whole(c.first_visit_order, 1) ||
      !whole(c.times_visited) ||
      !(c.total_days_spent === null || validHalfDays(c.total_days_spent)) ||
      typeof c.visit_history_complete !== "boolean" ||
      typeof c.notes !== "string" ||
      !Array.isArray(c.aliases) ||
      c.aliases.some((a) => typeof a !== "string")
    )
      throw new Error("Invalid saved country.");
    if (c.first_visit_order !== null) {
      if (orders.has(c.first_visit_order) || c.visit_status !== "visited")
        throw new Error("Invalid country visit order.");
      orders.add(c.first_visit_order);
    }
    map.set(c.code, {
      code: c.code,
      name: c.name,
      continent: c.continent,
      ...(c.is_195 === null ? {} : { is195: c.is_195 }),
      visit: c.visit_status,
      firstVisitOrder: c.first_visit_order,
      timesVisited: c.times_visited,
      totalDaysSpent: c.total_days_spent,
      visitHistoryComplete: c.visit_history_complete,
      notes: c.notes,
      aliases: c.aliases,
      visits: [],
    });
  }
  const visits = new Map<string, NonNullable<CountrySeed["visits"]>[number]>();
  for (const v of s.visits) {
    const c = map.get(v.country_code),
      key = `${v.country_code}:${v.visit_number}`;
    if (
      !c ||
      c.visit !== "visited" ||
      !whole(v.visit_number, 1) ||
      v.visit_number === null ||
      visits.has(key) ||
      !date(v.arrival_date) ||
      !date(v.departure_date) ||
      !(v.days_spent === null || validHalfDays(v.days_spent, 0.5)) ||
      typeof v.notes !== "string"
    )
      throw new Error("Invalid saved country visit.");
    const visit = {
      number: v.visit_number,
      arrival: v.arrival_date,
      departure: v.departure_date,
      daysSpent: v.days_spent,
      notes: v.notes,
      periods: [],
    };
    c.visits!.push(visit);
    visits.set(key, visit);
  }
  const seen = new Set<string>();
  for (const p of s.periods) {
    const visit = visits.get(`${p.country_code}:${p.visit_number}`),
      key = `${p.country_code}:${p.visit_number}:${p.period_number}`;
    if (
      !visit ||
      seen.has(key) ||
      !whole(p.period_number, 1) ||
      p.period_number === null ||
      !(p.days_spent == null || validHalfDays(p.days_spent, 0.5)) ||
      typeof p.source_refs !== "string" ||
      typeof p.notes !== "string"
    )
      throw new Error("Invalid saved stay period.");
    seen.add(key);
    visit.periods!.push({
      number: p.period_number,
      arrival: p.arrival_date,
      departure: p.departure_date,
      ...(p.days_spent != null ? { daysSpent: p.days_spent } : {}),
      sourceRefs: p.source_refs,
      notes: p.notes,
    });
  }
  const result = calculateRecordedHistory([...map.values()]);
  for (const c of result) {
    c.visits!.sort((a, b) => a.number - b.number);
    if (c.visits!.some((v, i) => v.number !== i + 1))
      throw new Error("Invalid saved visit numbering.");
    const knownDays = c.visits!.reduce((n, v) => n + (v.daysSpent ?? 0), 0);
    if (
      (c.timesVisited != null && c.timesVisited < c.visits!.length) ||
      (c.totalDaysSpent != null && c.totalDaysSpent < knownDays)
    )
      throw new Error("Invalid saved country totals.");
    if (c.visitHistoryComplete) {
      if (
        (c.timesVisited != null && c.timesVisited !== c.visits!.length) ||
        (c.visit === "visited" && !c.visits!.length)
      )
        throw new Error("Invalid complete country history.");
      c.timesVisited ??= c.visits!.length;
      if (c.visits!.every((v) => v.daysSpent !== null)) {
        if (c.totalDaysSpent != null && c.totalDaysSpent !== knownDays)
          throw new Error("Invalid complete country days.");
        c.totalDaysSpent ??= knownDays;
      }
    }
  }
  return result;
}
