import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { cityCollection, citySeedSql } from "../scripts/city-database";
import { countryDatabaseSql } from "../scripts/country-database";
import { seedSql } from "../scripts/supabase-data";
import { toCityRow } from "../src/lib/cloud-data";
import {
  toCityPeriodRows,
  toCityStayRows,
  toCityVisitRows,
  readCitySnapshot,
} from "../src/lib/city-cloud-data";
import {
  CITY_VISIT_GAP_DAYS,
  cityVisitSummary,
  groupCityStays,
  validateCityVisits,
} from "../src/lib/city-visits";
import { durationUpdateSql } from "../scripts/duration-updates";
import type { CitySnapshot } from "../src/lib/city-cloud-data";

const stay = (arrival: string, departure = arrival, daysSpent = 1) => ({
  arrival,
  departure,
  daysSpent,
});

test("city grouping merges a five-day gap, separates an exact six-day gap, and measures from the previous departure", () => {
  assert.equal(CITY_VISIT_GAP_DAYS, 6);
  const visits = groupCityStays([
    stay("2026-01-01", "2026-01-03", 2.5),
    stay("2026-01-08"), // Five days after departure, seven after arrival.
    stay("2026-01-14", "2026-01-15", 1.5), // Exactly six: a new visit.
    stay("2026-01-20"), // Five: joins the second visit.
    stay("2026-01-26"), // Exactly six again.
  ]);
  assert.deepEqual(
    visits.map((v) => [
      v.number,
      v.arrival,
      v.departure,
      v.daysSpent,
      v.periods!.length,
    ]),
    [
      [1, "2026-01-01", "2026-01-08", 3.5, 2],
      [2, "2026-01-14", "2026-01-20", 2.5, 2],
      [3, "2026-01-26", "2026-01-26", 1, 1],
    ],
  );
  assert.deepEqual(validateCityVisits(visits), visits);
  assert.deepEqual(cityVisitSummary(visits), {
    visits: 3,
    days: 7,
    lastVisited: "2026-01-26",
  });
  const chain = [
    stay("2025-12-28"),
    stay("2026-01-02", "2026-01-02", 0.5),
    stay("2026-01-07"),
  ];
  assert.equal(
    groupCityStays(chain).length,
    1,
    "Each successive gap is measured, rather than the first arrival",
  );
  assert.equal(groupCityStays([...chain].reverse())[0].daysSpent, 2.5);
  assert.equal(
    groupCityStays([stay("2024-02-25"), stay("2024-03-01")]).length,
    1,
    "Leap day is included in the gap",
  );
  assert.equal(
    groupCityStays([stay("2024-02-24"), stay("2024-03-01")]).length,
    2,
  );
  assert.throws(
    () =>
      groupCityStays([stay("2026-01-01", "2026-01-03", 3), stay("2026-01-03")]),
    /overlap/,
  );
});

test("all affected city counts follow the six-day rule without changing any stay or duration", () => {
  const cities = cityCollection();
  const expected: Record<string, number> = {
    Antigua: 1,
    Tashkent: 1,
    Bern: 3,
    Boston: 2,
    Budapest: 2,
    Dubai: 3,
    Istanbul: 2,
    London: 4,
    "Panama City": 1,
    Shanghai: 1,
    Singapore: 4,
    "Washington DC": 2,
  };
  const affected = cities.filter(
    (c) =>
      c.visits &&
      c.visits.length !== c.visits.flatMap((v) => v.periods!).length,
  );
  assert.deepEqual(
    affected.map((c) => c.name).sort(),
    Object.keys(expected).sort(),
  );
  for (const c of affected)
    assert.equal(c.visits!.length, expected[c.name], c.name);
  const stays = toCityStayRows(cities),
    periods = toCityPeriodRows(cities),
    visits = toCityVisitRows(cities);
  assert.equal(visits.length, 219);
  assert.equal(periods.length, 232);
  const values = (rows: typeof stays) =>
    rows.map((r) => [
      r.city_id,
      r.arrival_date,
      r.departure_date,
      r.days_spent,
    ]);
  assert.deepEqual(values(periods), values(stays));
  assert.equal(
    visits.reduce((n, v) => n + v.days_spent, 0),
    393.5,
  );
  const legacy = readCitySnapshot({
    cities: cities.map(toCityRow),
    visits: stays,
  });
  assert.deepEqual(
    legacy.visits,
    visits,
    "Old server responses are grouped during a rolling deployment",
  );
  assert.deepEqual(legacy.periods, periods);
  assert.throws(
    () => readCitySnapshot({ ...legacy, periods: [] }),
    /Invalid city/,
  );
  const bad = structuredClone(legacy);
  bad.periods.find((p) => p.city_id === "shanghai-china")!.days_spent = 2;
  assert.throws(() => readCitySnapshot(bad), /Invalid city/);
});

test("the live-format migration preserves all 232 stays, country history, metadata and revisions, with SQL-enforced grouping and private writes", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111";
  const migration = readFileSync(
    "supabase/migrations/202611140002_city_visit_periods.sql",
    "utf8",
  );
  const load = async () =>
    (
      await db.query<{ cities: CitySnapshot; countries: unknown }>(
        "select atlas_city_snapshot() as cities,atlas_country_snapshot() as countries",
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
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;insert into auth.users values('${owner}');`);
    await db.exec(
      readFileSync("supabase/migrations/202611120001_atlas.sql", "utf8"),
    );
    await db.exec(countryDatabaseSql().sql);
    await db.exec(
      readFileSync("supabase/migrations/202611130002_city_history.sql", "utf8"),
    );
    await db.exec(`insert into atlas_private.editors values('${owner}');`);
    const cities = cityCollection();
    await db.exec(seedSql(cities.map(toCityRow)));
    await db.exec(`begin;${citySeedSql(cities, true)}commit;`);
    await db.exec(
      "update cities set map_status='Update',notes='Preserve owner edit',pin_color='#123456' where id='london-uk';",
    );
    const before = await load();
    assert.equal(before.cities.visits.length, 232);
    assert.equal(before.cities.periods, undefined);
    await db.exec(migration.replace(/commit;\s*$/i, "rollback;"));
    assert.deepEqual(
      await load(),
      before,
      "A dry run leaves the old schema and all data intact",
    );
    await db.exec(migration);
    const after = await load();
    assert.equal(after.cities.visits.length, 219);
    assert.equal(after.cities.periods.length, 232);
    assert.deepEqual(after.cities.cities, before.cities.cities);
    assert.deepEqual(after.countries, before.countries);
    const stays = (rows: typeof before.cities.visits) =>
      rows.map((p) => [
        p.city_id,
        p.arrival_date,
        p.departure_date,
        p.days_spent,
      ]);
    assert.deepEqual(stays(after.cities.periods), stays(before.cities.visits));
    assert.deepEqual(readCitySnapshot(after.cities), after.cities);
    await db.exec(migration);
    assert.deepEqual(
      await load(),
      after,
      "Repeating the migration preserves all revisions",
    );
    await assert.rejects(
      db.exec(durationUpdateSql().sql),
      /Historical patch predates city grouping/,
    );
    await db.exec("rollback;");
    await db.exec("set role anon;");
    assert.equal((await load()).cities.periods.length, 232);
    await fails(
      "update city_visit_periods set days_spent=1 where city_id='shanghai-china'",
      /permission denied/,
    );
    await db.exec("reset role;set role authenticated;");
    assert.equal(
      (
        await db.query(
          "delete from city_visit_periods where city_id='shanghai-china' returning city_id",
        )
      ).rows.length,
      0,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await fails(
      "update city_visits set days_spent=3 where city_id='shanghai-china'",
      /agree with numbered actual stay periods/,
    );
    await fails(
      "delete from city_visit_periods where city_id='shanghai-china'",
      /agree with numbered actual stay periods/,
    );
    await fails(
      "update city_visit_periods set period_number=3 where city_id='shanghai-china' and period_number=2",
      /numbered actual stay periods/,
    );
    await fails(
      "update city_visit_periods set days_spent=1.25 where city_id='shanghai-china'",
      /check constraint/,
    );
    // Both shapes have valid bounds and sums; the grouping boundary itself must reject them.
    await fails(
      `insert into city_visits values('moscow-russia',1,'2026-01-01','2026-01-01',1),('moscow-russia',2,'2026-01-06','2026-01-06',1);
      insert into city_visit_periods values('moscow-russia',1,1,'2026-01-01','2026-01-01',1),('moscow-russia',2,1,'2026-01-06','2026-01-06',1)`,
      /at least six days/,
    );
    await fails(
      `insert into city_visits values('moscow-russia',1,'2026-01-01','2026-01-07',2);
      insert into city_visit_periods values('moscow-russia',1,1,'2026-01-01','2026-01-01',1),('moscow-russia',1,2,'2026-01-07','2026-01-07',1)`,
      /less than six days/,
    );
    await db.exec(`begin;insert into city_visits values('moscow-russia',1,'2026-01-01','2026-01-03',1.5),('moscow-russia',2,'2026-01-09','2026-01-09',1);
      insert into city_visit_periods values('moscow-russia',1,1,'2026-01-01','2026-01-03',1.5),('moscow-russia',2,1,'2026-01-09','2026-01-09',1);commit;`);
    const added = readCitySnapshot((await load()).cities);
    assert.equal(
      added.visits.filter((v) => v.city_id === "moscow-russia").length,
      2,
      "An exact six-day gap is accepted as two visits",
    );
    assert.equal(
      added.cities.find((c) => c.id === "moscow-russia")!.last_visited,
      "2026-01-09",
    );
    assert.deepEqual((await load()).countries, before.countries);
  } finally {
    await db.close();
  }
});
