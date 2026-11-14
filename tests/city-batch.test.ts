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
  (b: { id: string }) => b.id === "expanded-cities-verified",
);

test("the verified expanded workbook survives in the CSVs with inclusive dates, exact halves and six-day grouping", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(`data/sources/${batch.sourceFile}`))
      .digest("hex"),
    batch.sourceSha256,
  );
  const cities = cityCollection(),
    ids = new Set(batch.cities.map((c: { city_id: string }) => c.city_id));
  const added = cities.filter((c) => ids.has(c.id)),
    periods = toCityPeriodRows(added),
    visits = toCityVisitRows(added);
  assert.equal(added.length, 21);
  assert.equal(periods.length, 26);
  assert.equal(visits.length, 25);
  assert.equal(
    periods.reduce((n, p) => n + p.days_spent, 0),
    40,
  );
  for (const source of batch.cities) {
    const actual = periods.filter((p) => p.city_id === source.city_id);
    assert.deepEqual(
      actual.map((p) => [p.arrival_date, p.departure_date, p.days_spent]),
      source.visits.map((v: { start: string; end: string; days: number }) => [
        v.start,
        v.end,
        v.days,
      ]),
      source.city,
    );
    const city = added.find((c) => c.id === source.city_id)!;
    assert.equal(city.countryCode, source.country_code);
    assert.equal(city.visit, "visited");
  }
  const tashkent = added.find((c) => c.id === "tashkent-uzbekistan")!;
  assert.equal(tashkent.visits!.length, 1);
  assert.equal(tashkent.visits![0].periods!.length, 2);
  assert.equal(tashkent.visits![0].daysSpent, 2);
  for (const [id, start, end] of [
    ["nadi-fiji", "2025-08-04", "2025-08-05"],
    ["san-jose-costa-rica", "2025-04-06", "2025-04-07"],
  ]) {
    const v = added.find((c) => c.id === id)!.visits![0];
    assert.deepEqual([v.arrival, v.departure, v.daysSpent], [start, end, 1.5]);
  }
  const old = cities.filter((c) => !ids.has(c.id));
  assert.equal(toCityVisitRows(old).length, 112);
  assert.equal(toCityPeriodRows(old).length, 124);
  assert.equal(
    toCityVisitRows(old).reduce((n, v) => n + v.days_spent, 0),
    265.5,
  );
  assert.equal(cities.length, 327);
  assert.equal(cities.filter((c) => c.visit === "visited").length, 90);
  assert.equal(toCityVisitRows(cities).length, 137);
  assert.equal(toCityPeriodRows(cities).length, 150);
  assert.equal(
    toCityVisitRows(cities).reduce((n, v) => n + v.days_spent, 0),
    305.5,
  );
});
