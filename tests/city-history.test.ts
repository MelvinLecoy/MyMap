import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { cityCollection, cityDatabaseSql } from "../scripts/city-database.js";
import { importCityHistory } from "../scripts/city-importer.js";
import { importCities } from "../scripts/importer.js";
import { countryDatabaseSql } from "../scripts/country-database.js";
import { seedSql } from "../scripts/supabase-data.js";
import {
  exportCitiesCsv,
  fromCityRow,
  toCityRow,
} from "../src/lib/cloud-data.js";
import {
  attachCityVisits,
  exportCityVisitsCsv,
  readCitySnapshot,
  toCityVisitRows,
} from "../src/lib/city-cloud-data.js";
import {
  cityVisitSummary,
  formatCityVisitRange,
  validateCityVisits,
} from "../src/lib/city-visits.js";

const cities = cityCollection(),
  history = toCityVisitRows(cities);
const find = (id: string) => cities.find((c) => c.id === id)!;

test("all approved screenshot entries survive, with only the seven requested corrections", () => {
  const cards = JSON.parse(
    readFileSync("data/sources/city-screenshot-transcription.json", "utf8"),
  ) as Array<{
    city: string;
    excluded: boolean;
    visits: Array<{ start: string; end: string; days: number }>;
  }>;
  const aliases: Record<string, string> = {
    "New York": "New York City",
    Washington: "Washington DC",
    Lucerne: "Luzern",
    Aqtau: "Aktau",
    "Antigua Guatemala": "Antigua",
  };
  const dateChanges: Record<string, string> = {
    "Prague:2024-05-24": "2024-05-05",
    "Panama City:2025-05-24": "2025-03-24",
    "Boston:2021-08-21": "2021-08-20",
  };
  const halfDays: Record<string, number> = {
    "London:2026-05-01": 2.5,
    "Seoul:2025-07-17": 3.5,
    "Auckland:2025-08-05": 3.5,
    "Singapore:2026-09-11": 1.5,
  };
  for (const card of cards) {
    const city = cities.find(
      (c) => c.name === (aliases[card.city] ?? card.city),
    );
    if (card.excluded) {
      assert.ok(!city?.visits?.length, card.city);
      continue;
    }
    assert.ok(city, card.city);
    const expected = card.visits
      .map((v) => {
        const key = `${card.city}:${v.start}`,
          arrival = dateChanges[key] ?? v.start;
        const departure = dateChanges[key]
          ? new Date(Date.parse(arrival) + (v.days - 1) * 86400000)
              .toISOString()
              .slice(0, 10)
          : v.end;
        return { arrival, departure, daysSpent: halfDays[key] ?? v.days };
      })
      .sort((a, b) => a.arrival.localeCompare(b.arrival))
      .map((v, i) => ({ number: i + 1, ...v }));
    assert.deepEqual(city.visits, expected, card.city);
    assert.equal(city.lastVisited, expected.at(-1)!.departure);
  }
  assert.equal(cards.filter((c) => !c.excluded).length, 57);
  assert.equal(cities.filter((c) => c.visits?.length).length, 57);
  assert.equal(history.length, 111);
  assert.equal(
    history.reduce((n, v) => n + v.days_spent, 0),
    249,
  );
  assert.equal(cities.length, 323);
  assert.equal(cities.filter((c) => c.visit === "visited").length, 57);
  assert.deepEqual(cityVisitSummary(find("auckland-new-zealand").visits!), {
    visits: 2,
    days: 4.5,
    lastVisited: "2025-08-08",
  });
  assert.equal(find("auckland-new-zealand").visits![0].arrival, "2025-07-28");
  assert.equal(cityVisitSummary(find("singapore-singapore").visits!).days, 7.5);
  assert.equal(cityVisitSummary(find("london-uk").visits!).days, 6.5);
  assert.equal(find("boston-usa").visits!.at(-1)!.departure, "2022-06-28");
});

test("city CSVs and cloud snapshots round-trip half-days without changing city metadata", () => {
  const metadata = importCities(exportCitiesCsv(cities)).data.cities;
  assert.deepEqual(
    importCityHistory(exportCityVisitsCsv(cities), metadata),
    cities,
  );
  const snapshot = readCitySnapshot({
    cities: cities.map(toCityRow),
    visits: history,
  });
  assert.deepEqual(
    attachCityVisits(snapshot.cities.map(fromCityRow), snapshot.visits),
    cities,
  );
  assert.equal(
    formatCityVisitRange({
      number: 1,
      arrival: "2023-12-14",
      departure: "2023-12-16",
      daysSpent: 3,
    }),
    "14 – 16 December 2023",
  );
  assert.equal(
    formatCityVisitRange({
      number: 1,
      arrival: "2025-07-31",
      departure: "2025-08-02",
      daysSpent: 3,
    }),
    "31 July 2025 – 2 August 2025",
  );
  assert.throws(
    () =>
      readCitySnapshot({ cities: snapshot.cities, visits: history.slice(1) }),
    /numbering|summary/,
  );
  assert.throws(
    () => attachCityVisits(cities, [{ ...history[0], city_id: "unknown" }]),
    /unknown city/,
  );
  const v = {
    number: 1,
    arrival: "2026-05-01",
    departure: "2026-05-03",
    daysSpent: 2.5,
  };
  for (const bad of [
    { ...v, arrival: "2026-02-30" },
    { ...v, departure: "2026-04-30" },
    { ...v, daysSpent: 2.25 },
    { ...v, daysSpent: 0 },
    { ...v, daysSpent: Infinity },
    { ...v, daysSpent: 4 },
    { ...v, number: 2 },
  ])
    assert.throws(() => validateCityVisits([bad]), /Invalid city/);
  assert.throws(
    () => validateCityVisits([v, { ...v, number: 2, arrival: "2026-05-03" }]),
    /overlap/,
  );
  assert.throws(
    () =>
      importCityHistory(
        exportCityVisitsCsv(cities).replace('"2.5"', '"2.25"'),
        metadata,
      ),
    /half-day/,
  );
  assert.throws(
    () =>
      importCities(
        readFileSync("data/cities.csv", "utf8").replace(
          "Yes,2026-05-03,5,6.5",
          "Yes,2026-05-03,5,7",
        ),
        { cityVisits: readFileSync("data/city-visit-history.csv", "utf8") },
      ),
    /totals differ/,
  );
});

test("PostgreSQL imports city history atomically, preserves countries and edits, enforces half-days and permissions", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    stranger = "22222222-2222-4222-8222-222222222222";
  const { sql } = cityDatabaseSql();
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
  const fetch = async () =>
    readCitySnapshot(
      (
        await db.query<{ data: unknown }>(
          "select atlas_city_snapshot() as data",
        )
      ).rows[0].data,
    );
  const countries = async () =>
    (
      await db.query<{ data: unknown }>(
        "select atlas_country_snapshot() as data",
      )
    ).rows[0].data;
  try {
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;insert into auth.users values('${owner}'),('${stranger}');`);
    await db.exec(
      readFileSync("supabase/migrations/202611120001_atlas.sql", "utf8"),
    );
    await db.exec(`insert into atlas_private.editors values('${owner}');`);
    await db.exec(countryDatabaseSql().sql);
    const original = cities
      .filter(
        (c) => !["rome-italy", "vatican-city-vatican-city"].includes(c.id),
      )
      .map((c) => ({
        ...toCityRow(c),
        visit_status: "not-visited" as const,
        last_visited: null,
      }));
    await db.exec(seedSql(original));
    await db.exec(
      "update cities set map_status='Update',notes='Owner map edit',pin_color='#123456' where id='london-uk';update cities set visit_status='visited',last_visited='2020',notes='Unrelated visit' where id='moscow-russia';",
    );
    const countryBefore = await countries();
    const originalRows = (
      await db.query<{ data: Record<string, unknown> }>(
        "select to_jsonb(c) as data from cities c order by id",
      )
    ).rows.map((r) => r.data);
    await db.exec(sql.replace(/commit;\s*$/i, "rollback;"));
    assert.equal(
      (await db.query<{ n: number }>("select count(*)::int as n from cities"))
        .rows[0].n,
      321,
    );
    assert.equal(
      (
        await db.query<{ t: string | null }>(
          "select to_regclass('public.city_visits')::text as t",
        )
      ).rows[0].t,
      null,
    );
    await db.exec(sql);
    const imported = await fetch();
    assert.equal(imported.cities.length, 323);
    assert.equal(imported.visits.length, 111);
    assert.equal(
      imported.visits.reduce((n, v) => n + v.days_spent, 0),
      249,
    );
    assert.deepEqual(await countries(), countryBefore);
    for (const before of originalRows) {
      const after = imported.cities.find(
        (c) => c.id === before.id,
      )! as unknown as Record<string, unknown>;
      const targeted = history.some((v) => v.city_id === before.id);
      for (const [key, value] of Object.entries(before))
        if (
          !targeted ||
          !["visit_status", "last_visited", "updated_at"].includes(key)
        )
          assert.deepEqual(after[key], value, `${before.id}:${key}`);
    }
    await db.exec(sql);
    assert.deepEqual(
      await fetch(),
      imported,
      "Idempotent import must preserve revisions, not just values",
    );
    await db.exec("set role anon;");
    assert.equal((await fetch()).visits.length, 111);
    await fails(
      "update city_visits set days_spent=3 where city_id='london-uk'",
      /permission denied/,
    );
    await fails(
      "insert into city_visits values('moscow-russia',1,'2020-01-01','2020-01-01',1)",
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    await fails(
      "insert into city_visits values('moscow-russia',1,'2020-01-01','2020-01-01',1)",
      /row-level security/,
    );
    assert.equal(
      (
        await db.query(
          "delete from city_visits where city_id='london-uk' returning city_id",
        )
      ).rows.length,
      0,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await fails(
      "update city_visits set days_spent=2.25 where city_id='london-uk' and visit_number=5",
      /check constraint/,
    );
    await fails(
      "update city_visits set days_spent=4 where city_id='london-uk' and visit_number=5",
      /check constraint/,
    );
    await fails(
      "update city_visits set arrival_date='2026-02-30' where city_id='london-uk' and visit_number=5",
      /out of range/,
    );
    await fails(
      "update city_visits set visit_number=8 where city_id='london-uk' and visit_number=5",
      /numbered/,
    );
    await fails(
      "update city_visits set departure_date='2025-08-05' where city_id='auckland-new-zealand' and visit_number=1",
      /overlap/,
    );
    await fails(
      "insert into city_visits values('unknown',1,'2026-01-01','2026-01-01',1)",
      /foreign key/,
    );
    await fails(
      "update cities set last_visited='2026-05-02' where id='london-uk'",
      /agree with its history/,
    );
    await fails(
      "update cities set visit_status='planned',last_visited=null where id='london-uk'",
      /agree with its history/,
    );
    await db.exec(
      "update cities set map_status='Unfinished' where id='london-uk';",
    );
    assert.deepEqual(
      (await fetch()).visits,
      imported.visits,
      "Map status saves must retain all history",
    );
    await db.exec(
      "update city_visits set days_spent=3 where city_id='london-uk' and visit_number=5;",
    );
    const edited = await fetch();
    assert.equal(
      edited.visits.find(
        (v) => v.city_id === "london-uk" && v.visit_number === 5,
      )!.days_spent,
      3,
    );
    await db.exec("reset role;");
    await assert.rejects(db.exec(sql), /export and review/);
    await db.exec("rollback;");
    assert.deepEqual(
      await fetch(),
      edited,
      "Conflicting reimports must roll back everything",
    );
    assert.deepEqual(await countries(), countryBefore);
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await db.exec(
      "delete from city_visits where city_id='london-uk' and visit_number=5;",
    );
    assert.equal(
      (await fetch()).cities.find((c) => c.id === "london-uk")!.last_visited,
      "2025-05-07",
    );
    await db.exec("delete from city_visits where city_id='london-uk';");
    assert.equal(
      (await fetch()).cities.find((c) => c.id === "london-uk")!.last_visited,
      null,
    );
    await db.exec(
      "insert into city_visits values('moscow-russia',1,'2026-01-01','2026-01-01',0.5),('moscow-russia',2,'2026-01-02','2026-01-02',1);",
    );
    const newHistory = await fetch();
    const moscow = newHistory.cities.find((c) => c.id === "moscow-russia")!;
    assert.equal(moscow.last_visited, "2026-01-02");
    assert.equal(moscow.visit_status, "visited");
    assert.equal(moscow.notes, "Unrelated visit");
    assert.equal(
      newHistory.visits.filter((v) => v.city_id === "moscow-russia").length,
      2,
    );
    assert.deepEqual(await countries(), countryBefore);
  } finally {
    await db.close();
  }
});
