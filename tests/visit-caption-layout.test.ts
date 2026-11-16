import test from "node:test";
import assert from "node:assert/strict";
import {
  cityCaptionOptions,
  historyCityName,
  layoutVisitCaptions,
  visitSingleCity,
  type CaptionPeriod,
} from "../src/lib/visit-caption-layout";
const measure = (text: string) => text.length * 5;
const range = (cities: string[]): CaptionPeriod => ({
  cities,
  minimumWidth: 76,
  markerSize: 9,
  point: false,
  startDateWidth: 10,
  endDateWidth: 10,
});
const point = (cities: string[]): CaptionPeriod => ({
  ...range(cities),
  minimumWidth: 9,
  point: true,
});

test("a whole visit moves its one known city only when every stay agrees", () => {
  const city = { id: "shanghai-china", name: "Shanghai" };
  assert.equal(
    visitSingleCity([
      { exact: true, cities: [city] },
      { exact: true, cities: [city] },
    ]),
    city,
  );
  assert.equal(
    visitSingleCity([
      { exact: true, cities: [city] },
      { exact: true, cities: [] },
    ]),
    undefined,
  );
  assert.equal(visitSingleCity([{ exact: false, cities: [city] }]), undefined);
  assert.equal(
    visitSingleCity([
      { exact: true, cities: [city, { id: "other", name: "Other" }] },
    ]),
    undefined,
  );
  assert.equal(visitSingleCity([]), undefined);
});

test("owner-approved aliases apply only to history labels", () => {
  for (const [id, name, alias] of [
    ["gold-coast-australia", "Gold Coast", "GC"],
    ["rio-de-janeiro-brazil", "Rio de Janeiro", "Rio"],
    ["buenos-aires-argentina", "Buenos Aires", "BA"],
    ["andorra-la-vella-andorra", "Andorra la Vella", "Andorra lV"],
    ["kuala-lumpur-malaysia", "Kuala Lumpur", "KL"],
    ["johor-bahru-malaysia", "Johor Bahru", "JB"],
    ["ho-chi-minh-city-vietnam", "Ho Chi Minh City", "HCMC"],
    ["bandar-seri-begawan-brunei", "Bandar Seri Begawan", "BSB"],
    ["san-pedro-sula-honduras", "San Pedro Sula", "SPS"],
  ]) {
    const city = { id, name };
    assert.equal(historyCityName(city), alias);
    assert.equal(city.name, name);
  }
  assert.equal(
    historyCityName({ id: "other", name: "Gold Coast" }),
    "Gold Coast",
  );
});

test("caption partitions balance whole outlined cities with 1px gaps", () => {
  const names = ["Bath", "Cardiff", "Southampton", "London", "Portsmouth"];
  const option = cityCaptionOptions(names, measure, 76)[1];
  assert.deepEqual(option.lines, [
    ["Bath", "Cardiff", "Southampton"],
    ["London", "Portsmouth"],
  ]);
  assert.deepEqual(option.lines.flat(), names);
  assert.ok(
    option.width >=
      measure("Bath") + measure("Cardiff") + measure("Southampton") + 6 + 2,
  );
});

test("spare width produces one caption line and a supporting longer segment", () => {
  const cities = ["Geneva", "Interlaken", "Bern", "Lausanne", "Luzern"];
  const layout = layoutVisitCaptions([range(cities)], 300, measure);
  assert.equal(layout.tracks.length, 1);
  assert.deepEqual(layout.blocks[0].lines, [cities]);
  assert.ok(layout.blocks[0].width > 76);
  assert.ok(
    layout.blocks[0].width >=
      cities.reduce((sum, city) => sum + measure(city) + 2, 0) +
        cities.length -
        1,
  );
});

test("UK stays fit one track with one and two caption lines", () => {
  const layout = layoutVisitCaptions(
    [
      range(["London", "Bristol"]),
      range(["Bath", "Cardiff", "Southampton", "London", "Portsmouth"]),
    ],
    250,
    measure,
  );
  assert.equal(layout.tracks.length, 1);
  assert.deepEqual(
    layout.blocks.map((block) => block.lines.length),
    [1, 2],
  );
});

test("three Swiss stays stack captions to preserve one entire timeline track", () => {
  const periods = [
    range([
      "Basel",
      "Zurich",
      "Bern",
      "Interlaken",
      "Geneva",
      "Lausanne",
      "Luzern",
    ]),
    point(["Bern", "Lugano", "Zurich"]),
    point(["Bern", "Lausanne"]),
  ];
  const layout = layoutVisitCaptions(periods, 250, measure);
  assert.equal(layout.tracks.length, 1);
  assert.deepEqual(
    layout.blocks.map((block) => block.lines.length),
    [3, 2, 2],
  );
  assert.deepEqual(layout.tracks[0].indices, [0, 1, 2]);
  const narrow = layoutVisitCaptions(periods, 150, measure);
  assert.equal(narrow.tracks.length, 2);
  assert.deepEqual(
    narrow.tracks.flatMap((track) => track.indices),
    [0, 1, 2],
  );
  for (const track of narrow.tracks)
    assert.ok(
      track.indices.reduce(
        (sum, index) => sum + narrow.blocks[index].width,
        0,
      ) +
        track.gap * (track.indices.length - 1) <=
        150.01,
    );
});

test("Australia and New Zealand stack captions and compact ranges before wrapping a visit", () => {
  for (const periods of [
    [
      {
        ...range(["Brisbane", "GC", "Sunshine Coast"]),
        minimumWidth: 84,
        compactWidth: 64,
      },
      { ...range(["Sydney", "Melbourne"]), minimumWidth: 84, compactWidth: 64 },
    ],
    [
      {
        ...range(["Auckland", "Wellington"]),
        minimumWidth: 84,
        compactWidth: 64,
      },
      { ...range(["Auckland"]), minimumWidth: 84, compactWidth: 64 },
    ],
  ]) {
    const layout = layoutVisitCaptions(periods, 160, measure);
    assert.equal(layout.tracks.length, 1);
    assert.equal(layout.blocks[0].lines.length, 2);
    assert.ok(
      layout.blocks.reduce((sum, block) => sum + block.width, 0) +
        layout.tracks[0].gap <=
        160.01,
    );
    assert.deepEqual(layout.tracks[0].indices, [0, 1]);
  }
});

test("year-bearing dates retain space and long labels cannot overflow the track", () => {
  const dates = [
    { ...point([]), startDateWidth: 45, endDateWidth: 45 },
    { ...point([]), startDateWidth: 40, endDateWidth: 40 },
  ];
  const layout = layoutVisitCaptions(dates, 100, measure);
  assert.ok(layout.tracks[0].gap >= 37.5);
  const long = layoutVisitCaptions(
    [range(["An exceptionally long future city name"])],
    90,
    measure,
  );
  assert.ok(long.blocks[0].width <= 90);
  assert.deepEqual(layoutVisitCaptions([], 90, measure), {
    blocks: [],
    tracks: [],
  });
});
