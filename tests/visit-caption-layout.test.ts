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

test("Gold Coast is abbreviated only for history captions", () => {
  const city = { id: "gold-coast-australia", name: "Gold Coast" };
  assert.equal(historyCityName(city), "GC");
  assert.equal(city.name, "Gold Coast");
  assert.equal(
    historyCityName({ id: "other", name: "Gold Coast" }),
    "Gold Coast",
  );
});

test("caption partitions balance whole city names without trailing separators", () => {
  const names = ["Bath", "Cardiff", "Southampton", "London", "Portsmouth"];
  const option = cityCaptionOptions(names, measure, 76)[1];
  assert.deepEqual(option.lines, [
    "Bath · Cardiff · Southampton",
    "London · Portsmouth",
  ]);
  assert.deepEqual(
    option.lines.flatMap((line) => line.split(" · ")),
    names,
  );
});

test("spare width produces one caption line and a supporting longer segment", () => {
  const cities = ["Geneva", "Interlaken", "Bern", "Lausanne", "Luzern"];
  const layout = layoutVisitCaptions([range(cities)], 300, measure);
  assert.equal(layout.tracks.length, 1);
  assert.deepEqual(layout.blocks[0].lines, [cities.join(" · ")]);
  assert.ok(layout.blocks[0].width > 76);
  assert.ok(layout.blocks[0].width >= measure(cities.join(" · ")));
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
    [3, 3, 2],
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
