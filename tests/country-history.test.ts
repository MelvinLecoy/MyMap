import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { countryCollection } from "../scripts/country-database";
import {
  fromCountrySnapshot,
  toCountrySnapshot,
} from "../src/lib/country-cloud-data";
import { calculateRecordedHistory } from "../src/lib/country-history";

const countries = countryCollection();
test("every verified country date, visit count and day total round-trips through the database representation", () => {
  const reference = parse(
    readFileSync("data/sources/yearbook-country-summary.csv", "utf8"),
    { bom: true, columns: true },
  ) as Record<string, string>[];
  const roundtrip = fromCountrySnapshot(toCountrySnapshot(countries));
  for (const row of reference) {
    const c = roundtrip.find((c) => c.code === row.CountryCode)!;
    assert.equal(
      c.recordedVisits,
      row.RecordedVisits ? Number(row.RecordedVisits) : null,
      c.code,
    );
    assert.equal(
      c.recordedDaysSpent,
      row.RecordedDaysSpent ? Number(row.RecordedDaysSpent) : null,
      c.code,
    );
    const dates = c
      .visits!.flatMap((v) =>
        (v.periods ?? []).map((p) =>
          p.arrival === p.departure ? p.arrival : `${p.arrival}/${p.departure}`,
        ),
      )
      .join(";");
    assert.equal(dates, row.ActualDatePeriods, c.code);
    assert.equal(c.timesVisited, null);
    assert.equal(c.totalDaysSpent, null);
    assert.equal(c.visitHistoryComplete, false);
  }
  assert.equal(roundtrip.filter((c) => c.is195 === true).length, 195);
  assert.equal(roundtrip.filter((c) => c.is195 !== undefined).length, 197);
  assert.equal(
    roundtrip.find((c) => c.code === "GB")?.visits?.at(-1)?.departure,
    "2026-05-03",
  );
});

test("14 calendar days starts a new visit; 13 merges, with gaps excluded from duration", () => {
  function example(gap: number, same: boolean) {
    const date = new Date(Date.UTC(2026, 0, 1 + gap))
      .toISOString()
      .slice(0, 10);
    return [
      {
        code: "FR",
        name: "France",
        continent: "Europe",
        visit: "visited",
        visits: same
          ? [
              {
                number: 1,
                arrival: "2026-01-01",
                departure: date,
                daysSpent: 2,
                periods: [
                  { number: 1, arrival: "2026-01-01", departure: "2026-01-01" },
                  { number: 2, arrival: date, departure: date },
                ],
              },
            ]
          : [
              {
                number: 1,
                arrival: "2026-01-01",
                departure: "2026-01-01",
                daysSpent: 1,
                periods: [
                  { number: 1, arrival: "2026-01-01", departure: "2026-01-01" },
                ],
              },
              {
                number: 2,
                arrival: date,
                departure: date,
                daysSpent: 1,
                periods: [{ number: 1, arrival: date, departure: date }],
              },
            ],
      },
    ];
  }
  assert.equal(
    calculateRecordedHistory(example(13, true))[0].recordedDaysSpent,
    2,
  );
  assert.equal(
    calculateRecordedHistory(example(14, false))[0].recordedVisits,
    2,
  );
  assert.throws(() => calculateRecordedHistory(example(14, true)), /14-day/);
  assert.throws(() => calculateRecordedHistory(example(13, false)), /14-day/);
});

test("corrupt snapshots, overlapping periods and false durations are rejected", () => {
  const data = toCountrySnapshot(countries);
  const corrupt = structuredClone(data);
  corrupt.periods.push(corrupt.periods[0]);
  assert.throws(() => fromCountrySnapshot(corrupt), /period/);
  const bad = structuredClone(data);
  bad.visits.find((v) => v.country_code === "AU")!.days_spent = 11;
  assert.throws(() => fromCountrySnapshot(bad), /days disagree/);
  const overlap = structuredClone(data);
  const nz = overlap.periods.filter((p) => p.country_code === "NZ");
  nz[1].arrival_date = nz[0].departure_date;
  assert.throws(() => fromCountrySnapshot(overlap), /overlap/);
  assert.throws(
    () => fromCountrySnapshot({ countries: [], visits: [], periods: [] }),
    /snapshot/,
  );
});
