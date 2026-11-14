import { readFileSync, writeFileSync } from "node:fs";
import { readCSV } from "./importer.js";
import { parse } from "csv-parse/sync";
import { CITY_VISIT_GAP_DAYS, groupCityStays } from "../src/lib/city-visits.js";

interface SourceCard {
  city: string;
  country_code: string;
  excluded: boolean;
  visits: { start: string; end: string; days: number }[];
}
const cards = JSON.parse(
  readFileSync("data/sources/city-screenshot-transcription.json", "utf8"),
) as SourceCard[];
const decisions = JSON.parse(
  readFileSync("data/sources/city-visit-decisions.json", "utf8"),
) as {
  corrections: {
    city: string;
    originalStart: string;
    start?: string;
    end?: string;
    days?: number;
  }[];
  expected: { cities: number; visits: number; stays: number; days: number };
  visitGapDays: number;
  excludedCities: string[];
  additionalVisits: {
    city: string;
    country_code: string;
    visits: SourceCard["visits"];
  }[];
};
const csv = (rows: unknown[][]) =>
  rows
    .map((row) =>
      row
        .map((value) => {
          const text = String(value ?? "");
          return /[",\r\n]/.test(text)
            ? `"${text.replaceAll('"', '""')}"`
            : text;
        })
        .join(","),
    )
    .join("\n") + "\n";
const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const sourceCsv = readFileSync("data/cities.csv", "utf8");
const originalHeaders = (
  parse(sourceCsv, { bom: true, to: 1 }) as string[][]
)[0];
const metadata = readCSV(sourceCsv).map((r) => r.values);
// These two cities are present in the approved history but absent from the original collection.
for (const row of [
  {
    cityid: "rome-italy",
    cities: "Rome",
    country: "Italy",
    countrycode: "IT",
    continent: "Europe",
    region: "Southern Europe",
    latitude: "41.90278",
    longitude: "12.49636",
  },
  {
    cityid: "vatican-city-vatican-city",
    cities: "Vatican City",
    country: "Vatican City",
    countrycode: "VA",
    continent: "Europe",
    region: "Southern Europe",
    latitude: "41.90292",
    longitude: "12.45339",
  },
  {
    cityid: "austin-usa",
    cities: "Austin",
    country: "USA",
    countrycode: "US",
    continent: "America",
    region: "North America",
    latitude: "30.2672",
    longitude: "-97.7431",
  },
  {
    cityid: "san-antonio-usa",
    cities: "San Antonio",
    country: "USA",
    countrycode: "US",
    continent: "America",
    region: "North America",
    latitude: "29.4241",
    longitude: "-98.4936",
  },
])
  if (!metadata.some((c) => c.cityid === row.cityid))
    metadata.push({
      subregion: "",
      status: "Not Started",
      link: "",
      visited: "No",
      ...row,
    });
const aliases: Record<string, string> = {
  "New York": "new-york-city-usa",
  Washington: "washington-dc-usa",
  "Vatican City": "vatican-city-vatican-city",
  Rome: "rome-italy",
  Aqtau: "aktau-kazakhstan",
  Lucerne: "luzern-switzerland",
  "Antigua Guatemala": "antigua-guatemala",
};
const history: unknown[][] = [];
const periods: unknown[][] = [];
let totalDays = 0,
  cityCount = 0;
const applied = new Set<number>();
// Original screenshot transcription is immutable. Append later owner-supplied
// histories here, so regeneration keeps the new cities and stays intact.
for (const card of [
  ...cards.filter((c) => !decisions.excludedCities.includes(c.city)),
  ...decisions.additionalVisits.map((v) => ({ ...v, excluded: false })),
]) {
  const matches = metadata.filter(
    (c) =>
      c.countrycode === card.country_code &&
      (aliases[card.city]
        ? c.cityid === aliases[card.city]
        : normalize(c.cities) === normalize(card.city)),
  );
  if (matches.length !== 1)
    throw new Error(`Ambiguous or missing city: ${card.city}`);
  const city = matches[0];
  const stays = card.visits
    .map((visit) => {
      const index = decisions.corrections.findIndex(
        (c) => c.city === card.city && c.originalStart === visit.start,
      );
      const correction = decisions.corrections[index];
      if (correction) applied.add(index);
      return {
        start: correction?.start ?? visit.start,
        end: correction?.end ?? visit.end,
        days: correction?.days ?? visit.days,
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
  const visits = groupCityStays(
    stays.map((s) => ({
      arrival: s.start,
      departure: s.end,
      daysSpent: s.days,
    })),
  );
  for (const visit of visits) {
    history.push([
      city.cityid,
      city.cities,
      city.countrycode,
      visit.number,
      visit.arrival,
      visit.departure,
      visit.daysSpent,
    ]);
    for (const period of visit.periods!)
      periods.push([
        city.cityid,
        city.cities,
        city.countrycode,
        visit.number,
        period.number,
        period.arrival,
        period.departure,
        period.daysSpent,
      ]);
  }
  city.visited = "Yes";
  city.lastvisited = stays.at(-1)!.end;
  city.recordedvisits = String(visits.length);
  city.recordeddaysspent = String(stays.reduce((n, s) => n + s.days, 0));
  totalDays += Number(city.recordeddaysspent);
  cityCount++;
}
if (
  applied.size !== decisions.corrections.length ||
  cityCount !== decisions.expected.cities ||
  history.length !== decisions.expected.visits ||
  periods.length !== decisions.expected.stays ||
  decisions.visitGapDays !== CITY_VISIT_GAP_DAYS ||
  totalDays !== decisions.expected.days
)
  throw new Error("Approved city history totals or corrections did not match.");
const headers = [
  ...originalHeaders,
  ...[
    "LastVisited",
    "RecordedVisits",
    "RecordedDaysSpent",
    "Latitude",
    "Longitude",
  ].filter(
    (h) =>
      !originalHeaders.some(
        (original) => original.toLowerCase() === h.toLowerCase(),
      ),
  ),
];
writeFileSync(
  "data/cities.csv",
  csv([
    headers,
    ...metadata.map((c) =>
      headers.map((h) => c[h.toLowerCase().replace(/\s+/g, "")] ?? ""),
    ),
  ]),
);
writeFileSync(
  "data/city-visit-history.csv",
  csv([
    [
      "CityId",
      "Cities",
      "CountryCode",
      "VisitNumber",
      "ArrivalDate",
      "DepartureDate",
      "DaysSpent",
    ],
    ...history.sort(
      (a, b) =>
        String(a[0]).localeCompare(String(b[0])) || Number(a[3]) - Number(b[3]),
    ),
  ]),
);
writeFileSync(
  "data/city-visit-periods.csv",
  csv([
    [
      "CityId",
      "Cities",
      "CountryCode",
      "VisitNumber",
      "PeriodNumber",
      "ArrivalDate",
      "DepartureDate",
      "DaysSpent",
    ],
    ...periods.sort(
      (a, b) =>
        String(a[0]).localeCompare(String(b[0])) ||
        Number(a[3]) - Number(b[3]) ||
        Number(a[4]) - Number(b[4]),
    ),
  ]),
);
console.log(
  JSON.stringify({
    cities: cityCount,
    visits: history.length,
    stays: periods.length,
    days: totalDays,
    collection: metadata.length,
  }),
);
