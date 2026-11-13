import type { CountrySeed, CountryTrip } from "../src/lib/countries.js";
import type { VisitStatus } from "../src/lib/types.js";
import { countryCode, readCSV, validDate } from "./importer.js";
import { calculateRecordedHistory } from "../src/lib/country-history.js";

function integer(
  value: string | undefined,
  name: string,
  minimum = 0,
): number | null {
  if (!value) return null;
  if (
    !/^\d+$/.test(value) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum
  ) {
    throw new Error(
      `${name} must be a whole number of at least ${minimum}, or blank.`,
    );
  }
  return Number(value);
}

export function importCountryHistory(
  overview: string,
  history: string,
  starter: CountrySeed[] = [],
  stayPeriods?: string,
): CountrySeed[] {
  const countries = new Map<string, CountrySeed>();
  const complete = new Map<string, boolean>();
  const orders = new Set<number>();
  const expectedRecorded = new Map<string, [number | null, number | null]>();
  for (const { values: row, line } of readCSV(overview, [
    "CountryCode",
    "Country",
    "Is195",
    "VisitStatus",
  ])) {
    const code = countryCode("", row.countrycode);
    const context = `Countries row ${line}`;
    if (!code || !row.country)
      throw new Error(
        `${context}: a valid country code and name are required.`,
      );
    if (countries.has(code))
      throw new Error(`${context}: duplicate country code ${code}.`);
    if (!["0", "1"].includes(row.is195))
      throw new Error(`${context}: Is195 must be 0 or 1.`);
    if (["XK", "TW"].includes(code) && row.is195 !== "0")
      throw new Error(
        `${context}: ${code} is included only in the 197-country view.`,
      );
    if (
      !["visited", "planned", "not-visited", "unknown"].includes(
        row.visitstatus,
      )
    )
      throw new Error(`${context}: invalid VisitStatus.`);
    if (
      row.visithistorycomplete &&
      !["0", "1"].includes(row.visithistorycomplete)
    )
      throw new Error(`${context}: VisitHistoryComplete must be 0 or 1.`);
    const firstVisitOrder = integer(
      row.firstvisitorder,
      `${context}: FirstVisitOrder`,
      1,
    );
    if (firstVisitOrder !== null) {
      if (orders.has(firstVisitOrder))
        throw new Error(
          `${context}: duplicate first-visit order ${firstVisitOrder}.`,
        );
      if (row.visitstatus !== "visited")
        throw new Error(
          `${context}: a first-visit order requires visited status.`,
        );
      orders.add(firstVisitOrder);
    }
    const previous = starter.find((country) => country.code === code);
    const continent = row.continent || previous?.continent;
    if (!continent) throw new Error(`${context}: add the country's Continent.`);
    countries.set(code, {
      code,
      name: row.country,
      continent,
      visit: row.visitstatus as VisitStatus,
      is195: row.is195 === "1",
      aliases: previous && previous.name !== row.country ? [previous.name] : [],
      firstVisitOrder,
      timesVisited: integer(row.timesvisited, `${context}: TimesVisited`),
      totalDaysSpent: integer(row.totaldaysspent, `${context}: TotalDaysSpent`),
      visitHistoryComplete: row.visithistorycomplete === "1",
      notes: row.notes || "",
      visits: [],
    });
    complete.set(code, row.visithistorycomplete === "1");
    expectedRecorded.set(code, [
      integer(row.recordedvisits, `${context}: RecordedVisits`),
      integer(row.recordeddaysspent, `${context}: RecordedDaysSpent`),
    ]);
  }
  const seen = new Set<string>();
  for (const { values: row, line } of readCSV(history, [
    "CountryCode",
    "VisitNumber",
  ])) {
    const country = countries.get(row.countrycode.toUpperCase());
    const context = `Country visit row ${line}`;
    if (!country)
      throw new Error(
        `${context}: ${row.countrycode} is missing from the country overview.`,
      );
    const number = integer(row.visitnumber, `${context}: VisitNumber`, 1);
    if (number === null)
      throw new Error(`${context}: VisitNumber is required for a visit.`);
    const key = `${country.code}:${number}`;
    if (seen.has(key)) throw new Error(`${context}: duplicate visit ${key}.`);
    seen.add(key);
    if (country.visit !== "visited")
      throw new Error(
        `${context}: past visits require visited status in the overview.`,
      );
    const arrival = row.arrivaldate || null;
    const departure = row.departuredate || null;
    if (
      (arrival && !validDate(arrival)) ||
      (departure && !validDate(departure))
    )
      throw new Error(
        `${context}: use valid YYYY, YYYY-MM, or YYYY-MM-DD dates.`,
      );
    if (arrival && departure) {
      const [arrivalYear, arrivalMonth = 1, arrivalDay = 1] = arrival
        .split("-")
        .map(Number);
      const [departureYear, departureMonth = 12, departureDay] = departure
        .split("-")
        .map(Number);
      const latestDeparture = Date.UTC(
        departureYear,
        departureMonth - 1,
        departureDay ??
          new Date(Date.UTC(departureYear, departureMonth, 0)).getUTCDate(),
      );
      if (latestDeparture < Date.UTC(arrivalYear, arrivalMonth - 1, arrivalDay))
        throw new Error(`${context}: departure is before arrival.`);
    }
    let daysSpent = integer(row.daysspent, `${context}: DaysSpent`, 1);
    if (
      !stayPeriods &&
      daysSpent === null &&
      arrival?.length === 10 &&
      departure?.length === 10
    ) {
      daysSpent =
        (Date.parse(departure) - Date.parse(arrival)) / 86_400_000 + 1;
    }
    country.visits!.push({
      number,
      arrival,
      departure,
      daysSpent,
      notes: row.notes || "",
    } satisfies CountryTrip);
  }
  if (stayPeriods) {
    const seenPeriods = new Set<string>();
    for (const { values: row, line } of readCSV(stayPeriods, [
      "CountryCode",
      "VisitNumber",
      "PeriodNumber",
      "ArrivalDate",
      "DepartureDate",
    ])) {
      const country = countries.get(row.countrycode.toUpperCase());
      const visitNumber = integer(
        row.visitnumber,
        `Stay period row ${line}: VisitNumber`,
        1,
      );
      const visit = country?.visits?.find((v) => v.number === visitNumber);
      const number = integer(
        row.periodnumber,
        `Stay period row ${line}: PeriodNumber`,
        1,
      );
      if (!visit || number === null)
        throw new Error(
          `Stay period row ${line}: unknown visit or missing period number.`,
        );
      const key = `${country!.code}:${visitNumber}:${number}`;
      if (seenPeriods.has(key))
        throw new Error(`Stay period row ${line}: duplicate period ${key}.`);
      seenPeriods.add(key);
      (visit.periods ??= []).push({
        number,
        arrival: row.arrivaldate,
        departure: row.departuredate,
        sourceRefs: row.sourcerefs || "",
        notes: row.notes || "",
      });
    }
  }
  calculateRecordedHistory([...countries.values()]);
  for (const country of countries.values()) {
    const expected = expectedRecorded.get(country.code)!;
    if (
      (expected[0] !== null && expected[0] !== country.recordedVisits) ||
      (expected[1] !== null && expected[1] !== country.recordedDaysSpent)
    )
      throw new Error(
        `${country.code}: recorded totals disagree with actual stay periods.`,
      );
  }
  for (const country of countries.values()) {
    const visits = country.visits!.sort((a, b) => a.number - b.number);
    const knownDays = visits.reduce(
      (total, visit) => total + (visit.daysSpent ?? 0),
      0,
    );
    if (
      country.timesVisited != null &&
      country.timesVisited < Math.max(0, ...visits.map((visit) => visit.number))
    )
      throw new Error(
        `${country.code}: TimesVisited is less than its recorded visit numbers.`,
      );
    if (country.totalDaysSpent != null && country.totalDaysSpent < knownDays)
      throw new Error(
        `${country.code}: TotalDaysSpent is less than its known visit days.`,
      );
    if (complete.get(country.code)) {
      if (visits.some((visit, index) => visit.number !== index + 1))
        throw new Error(
          `${country.code}: complete history needs consecutive visit numbers from 1.`,
        );
      if (
        country.timesVisited != null &&
        country.timesVisited !== visits.length
      )
        throw new Error(
          `${country.code}: TimesVisited disagrees with its complete history.`,
        );
      country.timesVisited ??= visits.length;
      if (country.visit === "visited" && !visits.length)
        throw new Error(
          `${country.code}: visited status requires at least one visit in complete history.`,
        );
      if (visits.every((visit) => visit.daysSpent !== null)) {
        if (
          country.totalDaysSpent != null &&
          country.totalDaysSpent !== knownDays
        )
          throw new Error(
            `${country.code}: TotalDaysSpent disagrees with its complete history.`,
          );
        country.totalDaysSpent ??= knownDays;
      }
    }
  }
  // Preserve existing territory details without counting them in either country set.
  for (const country of starter)
    if (!countries.has(country.code))
      countries.set(country.code, { ...country });
  return [...countries.values()].sort((a, b) => a.name.localeCompare(b.name));
}
