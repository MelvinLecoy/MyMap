import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  durationUpdatePlan,
  durationUpdateSql,
} from "../scripts/duration-updates";
import { countryCollection, countrySeedSql } from "../scripts/country-database";
import { cityCollection, citySeedSql } from "../scripts/city-database";
import { seedSql } from "../scripts/supabase-data";
import { toCityRow } from "../src/lib/cloud-data";
import {
  fromCountrySnapshot,
  toCountrySnapshot,
} from "../src/lib/country-cloud-data";
import { stayDays } from "../src/lib/country-history";
import { visitDurationAnnotation } from "../src/lib/visit-duration";
import { importCountryHistory } from "../scripts/country-importer";
import { COUNTRY_STRIPE_COLORS, VISIT_YEAR_COLORS } from "../src/lib/palette";
import { countryStripeImage } from "../src/lib/country-stripes";

test("approved country and city corrections preserve every other visit and render exceptional durations", () => {
  const countries = countryCollection(),
    plan = durationUpdatePlan();
  for (const [code, days] of [
    ["SG", 7],
    ["KR", 6.5],
    ["GB", 12.5],
    ["NZ", 5.5],
    ["CZ", 4],
  ] as const)
    assert.equal(
      countries.find((c) => c.code === code)!.recordedDaysSpent,
      days,
      code,
    );
  assert.equal(
    countries.reduce((n, c) => n + (c.recordedDaysSpent ?? 0), 0),
    273.5,
  );
  assert.equal(plan.after.periods.length, 127);
  const sg = countries.find((c) => c.code === "SG")!;
  assert.equal(sg.recordedVisits, 2);
  assert.equal(sg.visits![1].daysSpent, 6);
  assert.equal(sg.visits![1].periods!.length, 4);
  for (const [arrival, departure, days, text] of [
    ["2026-09-11", "2026-09-12", 1, " (1 day)"],
    ["2024-05-12", "2024-05-13", 1, " (1 day)"],
    ["2025-08-05", "2025-08-08", 3.5, " (3.5 days)"],
    ["2025-07-15", "2025-07-21", 6.5, " (6.5 days)"],
    ["2026-05-01", "2026-05-03", 2.5, " (2.5 days)"],
    ["2026-09-03", "2026-09-03", 1, ""],
    ["2024-05-05", "2024-05-06", 2, ""],
  ] as const)
    assert.equal(visitDurationAnnotation(arrival, departure, days), text);
  const cz = countries.find((c) => c.code === "CZ")!.visits![0].periods![1];
  assert.deepEqual(
    [cz.arrival, cz.departure, stayDays(cz)],
    ["2024-05-12", "2024-05-13", 1],
  );
  assert.deepEqual(plan.before.countries, plan.after.countries);
  assert.deepEqual(
    plan.before.visits.filter(
      (v) => v.country_code === "GB" && v.visit_number < 3,
    ),
    plan.after.visits.filter(
      (v) => v.country_code === "GB" && v.visit_number < 3,
    ),
  );
  assert.deepEqual(
    plan.cityBefore.filter(
      (v) => !["shanghai-china", "singapore-singapore"].includes(v.city_id),
    ),
    plan.cityAfter.filter(
      (v) => !["shanghai-china", "singapore-singapore"].includes(v.city_id),
    ),
  );
  assert.equal(
    plan.cityAfter.find(
      (v) => v.city_id === "shanghai-china" && v.arrival_date === "2026-08-30",
    )!.days_spent,
    1.5,
  );
  assert.equal(
    plan.cityAfter.find(
      (v) => v.city_id === "shanghai-china" && v.arrival_date === "2026-09-01",
    )!.days_spent,
    1,
  );
});

test("country half-days work for any country, reject quarters, and retain compatibility with old snapshots", () => {
  const overview =
    "CountryCode,Country,Continent,Is195,VisitStatus,TimesVisited,TotalDaysSpent,VisitHistoryComplete\nFR,France,Europe,1,visited,1,1.5,1\n";
  const visits =
    "CountryCode,VisitNumber,ArrivalDate,DepartureDate,DaysSpent\nFR,1,2026-01-01,2026-01-02,1.5\n";
  const periods =
    "CountryCode,VisitNumber,PeriodNumber,ArrivalDate,DepartureDate,DaysSpent\nFR,1,1,2026-01-01,2026-01-02,1.5\n";
  const data = importCountryHistory(overview, visits, [], periods);
  assert.equal(data[0].totalDaysSpent, 1.5);
  assert.equal(
    fromCountrySnapshot(toCountrySnapshot(data))[0].recordedDaysSpent,
    1.5,
  );
  for (const bad of ["1.25", "0", "-0.5", "NaN", "Infinity"])
    assert.throws(
      () =>
        importCountryHistory(overview, visits, [], periods.replace("1.5", bad)),
      /half-day|duration/,
    );
  assert.throws(
    () =>
      importCountryHistory(
        overview.replace(",1,1.5,1", ",1.5,1.5,1"),
        visits,
        [],
        periods,
      ),
    /whole number/,
  );
  const old = durationUpdatePlan().before;
  old.periods.forEach((p) => delete p.days_spent);
  assert.equal(
    fromCountrySnapshot(old).reduce(
      (n, c) => n + (c.recordedDaysSpent ?? 0),
      0,
    ),
    270,
  );
  const invalid = toCountrySnapshot(data);
  invalid.periods[0].days_spent = 1.25;
  assert.throws(() => fromCountrySnapshot(invalid), /period/);
  assert.throws(
    () =>
      stayDays({
        arrival: "2026-01-01",
        departure: "2026-01-01",
        daysSpent: 1.5,
      }),
    /duration/,
  );
});

test("2025 uses the same readable golden yellow for date text and stripe pixels", () => {
  assert.equal(COUNTRY_STRIPE_COLORS[2025], VISIT_YEAR_COLORS[2025]);
  const rgb = (hex: string) =>
    [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const lum = (hex: string) =>
    rgb(hex)
      .map((v) => v / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      .reduce((n, v, i) => n + v * [0.2126, 0.7152, 0.0722][i], 0);
  assert.ok(
    (lum("#fbfcf7") + 0.05) / (lum(VISIT_YEAR_COLORS[2025]) + 0.05) >= 4.5,
  );
  const pattern = countryStripeImage(COUNTRY_STRIPE_COLORS[2025]);
  const pixel =
    Array.from(pattern.data).findIndex((v, i) => i % 4 === 3 && v > 0) - 3;
  assert.ok(pixel >= 0);
  assert.deepEqual(
    Array.from(pattern.data.slice(pixel, pixel + 3)),
    rgb(VISIT_YEAR_COLORS[2025]),
  );
  assert.deepEqual(
    [VISIT_YEAR_COLORS[2026], VISIT_YEAR_COLORS[2024], VISIT_YEAR_COLORS[2023]],
    ["#26784f", "#e67e00", "#573122"],
  );
});

test("the live-format upgrade changes only approved rows, supports exact halves, rolls back conflicts and reimports safely", async () => {
  const db = new PGlite(),
    plan = durationUpdateSql();
  const owner = "11111111-1111-4111-8111-111111111111";
  const load = async () =>
    (
      await db.query<{ countries: unknown; cities: unknown }>(
        "select atlas_country_snapshot() as countries,atlas_city_snapshot() as cities",
      )
    ).rows[0];
  const fails = async (sql: string, pattern: RegExp) => {
    try {
      await assert.rejects(
        db.exec(`begin;${sql};set constraints all immediate;commit;`),
        pattern,
      );
    } finally {
      await db.exec("rollback;");
    }
  };
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${owner}');`,
    );
    for (const file of [
      "202611120001_atlas.sql",
      "202611130001_country_history.sql",
      "202611130002_city_history.sql",
    ])
      await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    await db.exec(`insert into atlas_private.editors values('${owner}');`);
    const old = structuredClone(plan.before);
    old.periods.forEach((p) => delete p.days_spent);
    await db.exec(countrySeedSql(old));
    const cities = cityCollection();
    cities
      .find((c) => c.id === "shanghai-china")!
      .visits!.find((v) => v.arrival === "2026-08-30")!.daysSpent = 2;
    cities
      .find((c) => c.id === "singapore-singapore")!
      .visits!.find((v) => v.arrival === "2026-09-11")!.daysSpent = 1.5;
    await db.exec(seedSql(cities.map(toCityRow)));
    await db.exec(`begin;${citySeedSql(cities)}commit;`);
    const before = await load();
    await db.exec(plan.sql.replace(/commit;\s*$/i, "rollback;"));
    assert.deepEqual(await load(), before);
    await db.exec(plan.sql);
    const after = await load();
    assert.equal(
      fromCountrySnapshot(after.countries).reduce(
        (n, c) => n + (c.recordedDaysSpent ?? 0),
        0,
      ),
      273.5,
    );
    await db.exec(plan.sql);
    assert.deepEqual(await load(), after);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await fails(
      "update country_visit_periods set days_spent=1.25 where country_code='CZ' and visit_number=1 and period_number=2",
      /check constraint/,
    );
    await fails(
      "update countries set total_days_spent=6.75 where code='KR'",
      /check constraint/,
    );
    await fails(
      "update country_visit_periods set days_spent=4.5 where country_code='NZ' and period_number=2",
      /check constraint/,
    );
    await fails(
      "update country_visits set days_spent=7 where country_code='KR'",
      /disagree/,
    );
    await db.exec("update countries set total_days_spent=6.5 where code='KR';");
    assert.equal(
      fromCountrySnapshot((await load()).countries).find(
        (c) => c.code === "KR",
      )!.totalDaysSpent,
      6.5,
    );
    await db.exec(
      "update city_visits set days_spent=1 where city_id='shanghai-china' and arrival_date='2026-08-30';reset role;",
    );
    const edited = await load();
    await assert.rejects(db.exec(plan.sql), /differs from the approved/);
    await db.exec("rollback;");
    assert.deepEqual(await load(), edited);
  } finally {
    await db.close();
  }
});
