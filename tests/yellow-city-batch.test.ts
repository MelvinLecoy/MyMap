import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { cityCollection } from "../scripts/city-database";
import { toCityPeriodRows, toCityVisitRows } from "../src/lib/city-cloud-data";

const manifest = JSON.parse(
  readFileSync("data/sources/city-visit-batches.json", "utf8"),
);
const batch = manifest.batches.find(
  (b: { id: string }) => b.id === "yellow-cities-81",
);

test("all 81 supplied cities retain exact stays, country identities and new-city locations", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(`data/sources/${batch.sourceFile}`))
      .digest("hex"),
    batch.sourceSha256,
  );
  const cities = cityCollection(),
    ids = new Set(batch.cities.map((c: { city_id: string }) => c.city_id));
  const added = cities.filter((c) => ids.has(c.id)),
    visits = toCityVisitRows(added),
    periods = toCityPeriodRows(added);
  assert.equal(added.length, 81);
  assert.equal(visits.length, 82);
  assert.equal(periods.length, 82);
  assert.equal(
    visits.reduce((n, v) => n + v.days_spent, 0),
    87,
  );
  for (const source of batch.cities) {
    const city = added.find((c) => c.id === source.city_id)!;
    assert.equal(city.countryCode, source.country_code);
    assert.equal(city.visit, "visited");
    assert.deepEqual(
      periods
        .filter((p) => p.city_id === city.id)
        .map((p) => [p.arrival_date, p.departure_date, p.days_spent]),
      source.visits.map((v: { start: string; end: string; days: number }) => [
        v.start,
        v.end,
        v.days,
      ]),
      source.sourceCity,
    );
  }
  assert.equal(batch.newCities.length, 13);
  for (const source of batch.newCities) {
    const city = added.find((c) => c.id === source.cityid)!;
    assert.ok(city.coordinates);
    assert.equal(city.map, null);
    assert.equal(city.status, "Not Started");
  }
  assert.ok(ids.has("andorra-la-vella-andorra"));
  assert.deepEqual(
    added
      .find((c) => c.id === "southampton-uk")!
      .visits!.map((v) => [v.arrival, v.departure, v.daysSpent]),
    [["2023-12-22", "2023-12-25", 4]],
  );
  assert.equal(
    added.find((c) => c.id === "interlaken-switzerland")!.visits!.length,
    2,
  );
  const seoul = cities.find((c) => c.id === "seoul-south-korea")!;
  assert.deepEqual(
    seoul.visits!.map((v) => [v.arrival, v.departure, v.daysSpent]),
    [["2025-07-17", "2025-07-21", 4.5]],
  );
  assert.equal(seoul.lastVisited, "2025-07-21");
  assert.equal(cities.length, 340);
  assert.equal(cities.filter((c) => c.visit === "visited").length, 171);
  assert.equal(toCityVisitRows(cities).length, 219);
  assert.equal(toCityPeriodRows(cities).length, 232);
  assert.equal(
    toCityVisitRows(cities).reduce((n, v) => n + v.days_spent, 0),
    393.5,
  );
});
