import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  visitTimelineYears,
  type HistoryVisit,
} from "../src/lib/visit-timeline";
import { stayMarkers } from "../src/lib/visit-markers";
const countryData = JSON.parse(
  readFileSync("src/generated/countries.json", "utf8"),
);
const cityData = JSON.parse(readFileSync("src/generated/atlas.json", "utf8"));
const country = (code: string): HistoryVisit[] =>
  countryData.countries.find((item: { code: string }) => item.code === code)
    .visits;

test("ordinary stays include both endpoints, including disconnected one-day periods", () => {
  const stays = visitTimelineYears(country("GB"))[2].visits[0].months[0]
    .periods;
  for (const kind of ["country", "city"] as const) {
    assert.deepEqual(stayMarkers(stays[1], { kind, countryCode: "GB" }), [
      "filled",
      "filled",
    ]);
    const disconnected = visitTimelineYears([
      {
        number: 1,
        arrival: "2026-05-01",
        departure: "2026-05-04",
        daysSpent: 2,
        periods: [
          {
            number: 1,
            arrival: "2026-05-01",
            departure: "2026-05-01",
            daysSpent: 1,
          },
          {
            number: 2,
            arrival: "2026-05-04",
            departure: "2026-05-04",
            daysSpent: 1,
          },
        ],
      },
    ])[0].visits[0].months[0].periods;
    for (const stay of disconnected)
      assert.deepEqual(stayMarkers(stay, { kind, countryCode: "SG" }), [
        "filled",
      ]);
    assert.equal(disconnected[1].precedingGap, true);
  }
});

test("all twelve recorded country exceptions follow the owner-selected endpoint rules", () => {
  const expected: Record<string, string[]> = {
    "BA/2026-05-03": ["hollow", "filled"],
    "CR/2025-04-06": ["filled", "hollow"],
    "CZ/2024-05-12": ["diamond"],
    "DO/2026-07-14": ["hollow", "filled"],
    "FJ/2025-08-04": ["filled", "hollow"],
    "ID/2026-09-03": ["hollow", "hollow"],
    "NZ/2025-08-05": ["filled", "hollow"],
    "SG/2026-09-11": ["diamond"],
    "KR/2025-07-15": ["filled", "hollow"],
    "GB/2023-12-14": ["filled", "hollow"],
    "GB/2026-05-01": ["filled", "hollow"],
    "VN/2025-07-22": ["filled", "hollow"],
  };
  const actual: Record<string, string[]> = {};
  for (const item of countryData.countries)
    for (const year of visitTimelineYears(item.visits ?? []))
      for (const visit of year.visits)
        for (const month of visit.months)
          for (const stay of month.periods)
            if (stay.exact && stay.exceptional)
              actual[`${item.code}/${stay.arrival}`] = stayMarkers(stay, {
                kind: "country",
                countryCode: item.code,
              });
  assert.deepEqual(actual, expected);
});

test("all eleven recorded city exceptions use half-day endpoints except Singapore's diamond", () => {
  const expected: Record<string, string[]> = Object.fromEntries(
    [
      "auckland-new-zealand/2025-08-05",
      "boston-usa/2022-06-26",
      "ho-chi-minh-city-vietnam/2025-07-22",
      "london-uk/2026-05-01",
      "los-angeles-usa/2022-01-30",
      "nadi-fiji/2025-08-04",
      "orlando-usa/2022-03-01",
      "san-jose-costa-rica/2025-04-06",
      "seoul-south-korea/2025-07-17",
      "shanghai-china/2026-08-30",
    ].map((key) => [key, ["filled", "hollow"]]),
  );
  expected["singapore-singapore/2026-09-11"] = ["diamond"];
  const actual: Record<string, string[]> = {};
  for (const city of cityData.cities)
    for (const year of visitTimelineYears(city.visits ?? []))
      for (const visit of year.visits)
        for (const month of visit.months)
          for (const stay of month.periods)
            if (stay.exact && stay.exceptional)
              actual[`${city.id}/${stay.arrival}`] = stayMarkers(stay, {
                kind: "city",
                countryCode: city.countryCode,
              });
  assert.deepEqual(actual, expected);
  // Country-only overrides must not leak into a city's exceptional stay.
  const exception = { single: false, exceptional: true, days: 2.5 };
  for (const countryCode of ["BA", "DO", "CZ", "ID"])
    assert.deepEqual(stayMarkers(exception, { kind: "city", countryCode }), [
      "filled",
      "hollow",
    ]);
});

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
  assert.deepEqual(denmark.visits[0].months[0].labels, ["JAN", "DEC"]);
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

test("country segments show the cities recorded on their own dates", () => {
  const cities = cityData.cities.filter(
    (city: { countryCode: string }) => city.countryCode === "CA",
  );
  const before = JSON.stringify(cities);
  const years = visitTimelineYears(country("CA"), cities);
  assert.deepEqual(
    years.flatMap((year) =>
      year.visits.flatMap((visit) =>
        visit.months.flatMap((month) =>
          month.periods.map((stay) => stay.cities.map((city) => city.name)),
        ),
      ),
    ),
    [["Ottawa"], ["Toronto"], ["Vancouver"]],
  );
  assert.equal(JSON.stringify(cities), before);
});

test("city matching uses actual periods, deduplicates cities, and leaves unknown dates unmatched", () => {
  const period = (arrival: string, departure = arrival) => ({
    number: 1,
    arrival,
    departure,
    daysSpent: 1,
  });
  const visits = [
    {
      number: 1,
      arrival: "2026-05-02",
      departure: "2026-05-07",
      daysSpent: 3,
      periods: [
        period("2026-05-02", "2026-05-03"),
        { ...period("2026-05-07"), number: 2 },
      ],
    },
  ];
  const cities = [
    {
      id: "gap",
      name: "Gap city",
      visits: [
        {
          ...period("2026-05-01", "2026-05-08"),
          periods: [period("2026-05-01"), period("2026-05-08")],
        },
      ],
    },
    {
      id: "alpha",
      name: "Alpha",
      visits: [
        {
          ...period("2026-05-02", "2026-05-07"),
          periods: [
            period("2026-05-02"),
            period("2026-05-03"),
            period("2026-05-07"),
          ],
        },
      ],
    },
    {
      id: "bravo",
      name: "Bravo",
      visits: [period("2026-05-01", "2026-05-03")],
    },
    { id: "partial", name: "Partial", visits: [period("2026-05")] },
  ];
  const before = JSON.stringify({ visits, cities });
  const stays = visitTimelineYears(visits, cities)[0].visits[0].months[0]
    .periods;
  assert.deepEqual(
    stays.map((stay) => stay.cities.map((city) => city.name)),
    [["Bravo", "Alpha"], ["Alpha"]],
  );
  assert.equal(JSON.stringify({ visits, cities }), before);
  assert.equal(
    visitTimelineYears(country("US"), cities)[0].visits[0].months[0].periods[0]
      .cities.length,
    0,
  );
  assert.ok(
    visitTimelineYears(visits)[0].visits[0].months[0].periods.every(
      (stay) => stay.cities.length === 0,
    ),
  );
});
