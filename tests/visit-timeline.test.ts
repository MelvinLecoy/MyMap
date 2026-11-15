import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  visitTimelineYears,
  type HistoryVisit,
} from "../src/lib/visit-timeline";
const countryData = JSON.parse(
  readFileSync("src/generated/countries.json", "utf8"),
);
const cityData = JSON.parse(readFileSync("src/generated/atlas.json", "utf8"));
const country = (code: string): HistoryVisit[] =>
  countryData.countries.find((item: { code: string }) => item.code === code)
    .visits;

test("timeline sorts years and visits newest first, preserves grouping and places exceptional durations on actual stays", () => {
  const visits = country("GB");
  const before = JSON.stringify(visits);
  const years = visitTimelineYears(visits);
  assert.deepEqual(
    years.map((group) => group.year),
    ["2026", "2025", "2023"],
  );
  assert.deepEqual(
    years.map((group) => group.visits[0].days),
    [2.5, 1, 9.5],
  );
  assert.equal(years[0].visits[0].months[0].periods[0].exceptional, true);
  const december = years[2].visits[0].months[0].periods;
  assert.deepEqual(
    december.map((stay) => [
      stay.startLabel,
      stay.endLabel,
      stay.days,
      stay.exceptional,
      stay.precedingGap,
    ]),
    [
      ["14", "17", 3.5, true, false],
      ["21", "26", 6, false, true],
    ],
  );
  assert.equal(JSON.stringify(visits), before);
  const london = cityData.cities.find(
    (item: { id: string }) => item.id === "london-uk",
  );
  const cityYears = visitTimelineYears(london.visits);
  assert.equal(cityYears[2].visits.length, 2);
  assert.deepEqual(
    cityYears[2].visits.map((visit) => visit.number),
    [2, 1],
  );
});

test("year colors are panel date colors and old years share the panel's brown", () => {
  const years = visitTimelineYears(country("GB"));
  assert.deepEqual(
    years.map((group) => group.color),
    ["#26784f", "#dfbf00", "#733900"],
  );
  assert.equal(visitTimelineYears(country("CH"))[0].color, "#e67e00");
  assert.equal(
    visitTimelineYears([
      {
        number: 1,
        arrival: "2021-08-20",
        departure: "2021-08-20",
        daysSpent: 0.5,
      },
    ])[0].color,
    "#733900",
  );
});

test("cross-month groups retain one visit total and gaps contribute no days", () => {
  const sg = visitTimelineYears(country("SG"))[0].visits[0];
  assert.equal(sg.days, 6);
  assert.deepEqual(
    sg.months.map((row) => [row.labels, row.periods.length]),
    [
      [["AUG"], 2],
      [["SEP"], 2],
    ],
  );
  assert.deepEqual(
    sg.months.flatMap((row) => row.periods).map((stay) => stay.days),
    [3, 1, 1, 1],
  );
  assert.equal(sg.months[1].periods[1].exceptional, true);
  const denmark = visitTimelineYears(country("DK"))[0];
  assert.equal(denmark.year, "2024");
  const stay = denmark.visits[0].months[0].periods[0];
  assert.deepEqual(
    [stay.startLabel, stay.endLabel, stay.days, stay.exceptional],
    ["30 Dec ’23", "1 Jan ’24", 3, false],
  );
});

test("unknown and partial dates remain honest and single half days receive a marker", () => {
  const usa = visitTimelineYears(country("US"))[0];
  assert.equal(usa.year, null);
  assert.equal(usa.visits[0].days, null);
  assert.equal(usa.visits[0].months[0].periods[0].range, "Dates not recorded");
  const partial = visitTimelineYears([
    { number: 1, arrival: "2020-06", departure: "2020-06", daysSpent: null },
  ])[0].visits[0].months[0].periods[0];
  assert.equal(partial.exact, false);
  assert.equal(partial.range, "June 2020");
  assert.equal(partial.days, null);
  const half = visitTimelineYears([
    {
      number: 1,
      arrival: "2026-09-03",
      departure: "2026-09-03",
      daysSpent: 0.5,
    },
  ])[0].visits[0].months[0].periods[0];
  assert.equal(half.single, true);
  assert.equal(half.exceptional, true);
});
