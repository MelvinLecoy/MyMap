import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { csvData, verifyData } from "../scripts/data-integrity";
import { dataPersistenceSql } from "../scripts/data-persistence";
import { cityCollection, citySeedSql } from "../scripts/city-database";
import { countryDatabaseSql } from "../scripts/country-database";
import { seedSql } from "../scripts/supabase-data";
import { toCityRow } from "../src/lib/cloud-data";
import { cityVisitSummary } from "../src/lib/city-visits";
import { toCityStayRows } from "../src/lib/city-cloud-data";

test("current CSVs agree across city/country tables and detect changed fields, missing stays and broken relationships", () => {
  const data = csvData(),
    report = verifyData(data);
  assert.equal(report.matches, true);
  const legacy = structuredClone(data);
  delete (legacy.cities as Partial<typeof legacy.cities>).periods;
  legacy.cities.visits = toCityStayRows(cityCollection());
  assert.ok(
    verifyData(legacy).issues.some((issue) =>
      issue.includes("missing from database snapshot"),
    ),
  );
  assert.deepEqual(report.counts, {
    cities: 343,
    visitedCities: 174,
    cityVisits: 222,
    cityStays: 235,
    cityDays: 400.5,
    countries: 198,
    countryVisits: 127,
    countryPeriods: 140,
    countryDays: 314.5,
  });
  const edited = structuredClone(data);
  edited.cities.cities[0].notes = "Unexpected edit";
  assert.ok(verifyData(edited).issues.some((x) => x.includes(".notes")));
  const missing = structuredClone(data);
  missing.cities.visits = missing.cities.visits.filter(
    (v) => v.city_id !== "seattle-usa",
  );
  missing.cities.periods = missing.cities.periods.filter(
    (p) => p.city_id !== "seattle-usa",
  );
  assert.ok(
    verifyData(missing).issues.some((x) =>
      x.includes("city_visits: missing seattle-usa"),
    ),
  );
  const relation = structuredClone(data);
  relation.cities.cities.find((c) => c.id === "seattle-usa")!.country_code =
    "ZZ";
  assert.ok(
    verifyData(relation).issues.some((x) =>
      x.includes("references a missing country"),
    ),
  );
  const inconsistent = structuredClone(data);
  const us = inconsistent.countries.countries.find((c) => c.code === "US")!;
  us.visit_status = "not-visited";
  us.first_visit_order = null;
  inconsistent.countries.visits = inconsistent.countries.visits.filter(
    (v) => v.country_code !== "US",
  );
  assert.ok(
    verifyData(inconsistent).issues.some((x) =>
      x.includes("is visited but its country is not"),
    ),
  );
});

test("approved main-branch changes synchronize atomically, survive a new read, reimport identically and preserve country history", async () => {
  const db = new PGlite(),
    owner = "11111111-1111-4111-8111-111111111111";
  const load = async () =>
    (
      await db.query<{
        cities: ReturnType<typeof csvData>["cities"];
        countries: ReturnType<typeof csvData>["countries"];
      }>(
        "select atlas_city_snapshot() as cities,atlas_country_snapshot() as countries",
      )
    ).rows[0];
  try {
    await db.exec(
      `create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;insert into auth.users values('${owner}');`,
    );
    await db.exec(
      readFileSync("supabase/migrations/202611120001_atlas.sql", "utf8"),
    );
    await db.exec(`insert into atlas_private.editors values('${owner}');`);
    await db.exec(countryDatabaseSql().sql);
    await db.exec(
      readFileSync("supabase/migrations/202611130002_city_history.sql", "utf8"),
    );
    const previous = cityCollection()
      .map((c) => ({
        ...c,
        visits: c.visits
          ?.flatMap((v) => v.periods ?? [v])
          .map((p, i) => ({
            number: i + 1,
            arrival: p.arrival,
            departure: p.departure,
            daysSpent: p.daysSpent,
          })),
      }))
      .filter(
        (c) =>
          !new Set([
            "austin-usa",
            "san-antonio-usa",
            ...JSON.parse(
              readFileSync("data/sources/city-visit-batches.json", "utf8"),
            ).batches.flatMap((b: { newCities: { cityid: string }[] }) =>
              b.newCities.map((c) => c.cityid),
            ),
          ]).has(c.id),
      );
    const additions = new Set([
      ...JSON.parse(
        readFileSync("data/sources/city-visit-batches.json", "utf8"),
      ).batches.flatMap((b: { cities: { city: string }[] }) =>
        b.cities.map((c) => c.city),
      ),
      "Seattle",
      "Dallas",
      "Denver",
      "San Diego",
      "Tijuana",
      "Baltimore",
      "Ottawa",
      "Montego Bay",
      "Santo Domingo",
      "San Pedro Sula",
    ]);
    for (const c of previous)
      if (additions.has(c.name)) {
        delete c.visits;
        c.visit = "not-visited";
        c.lastVisited = null;
      }
    for (const [id, number, end, days] of [
      ["los-angeles-usa", 1, "2022-02-01", 3],
      ["orlando-usa", 1, "2022-03-05", 5],
      ["boston-usa", 3, "2022-06-28", 3],
      ["san-francisco-usa", 2, "2025-11-01", 1],
    ] as const) {
      const c = previous.find((c) => c.id === id)!,
        v = c.visits!.find((v) => v.number === number)!;
      v.departure = end;
      v.daysSpent = days;
      c.lastVisited = cityVisitSummary(c.visits!).lastVisited;
    }
    const seoul = previous.find((c) => c.id === "seoul-south-korea")!;
    seoul.visits![0].departure = "2025-07-20";
    seoul.visits![0].daysSpent = 3.5;
    seoul.lastVisited = "2025-07-20";
    await db.exec(seedSql(previous.map(toCityRow)));
    await db.exec(`begin;${citySeedSql(previous, true)}commit;`);
    const before = await load();
    assert.equal(verifyData(before).counts.cityDays, 248);
    assert.equal(verifyData(before).matches, false);
    const { sql } = dataPersistenceSql();
    await db.exec(sql.replace(/commit;\s*$/i, "rollback;"));
    assert.deepEqual(await load(), before);
    await db.exec(sql);
    const after = await load();
    assert.equal(verifyData(after).matches, true);
    assert.deepEqual(after.countries, before.countries);
    for (const c of before.cities.cities) {
      const current = after.cities.cities.find((x) => x.id === c.id)!;
      for (const [key, value] of Object.entries(c))
        if (!["visit_status", "last_visited", "updated_at"].includes(key))
          assert.deepEqual(
            (current as unknown as Record<string, unknown>)[key],
            value,
            `${c.id}:${key}`,
          );
    }
    await db.exec(sql);
    assert.deepEqual(
      await load(),
      after,
      "Identical synchronization must retain revisions",
    );
    await db.exec("set role anon;");
    assert.equal(verifyData(await load()).matches, true);
    await db.exec("reset role;");
    await db.exec(
      "update cities set map_status='Update',notes='Owner live edit' where id='london-uk';",
    );
    const edited = await load();
    await assert.rejects(db.exec(sql), /differs from the approved CSV/);
    await db.exec("rollback;");
    assert.deepEqual(
      await load(),
      edited,
      "Never discard an unexported owner edit",
    );
    await db.exec(
      "update cities set map_status='Complete',notes='' where id='london-uk';delete from city_visits;",
    );
    assert.equal((await load()).cities.visits.length, 0);
    await db.exec(sql);
    assert.equal(
      verifyData(await load()).matches,
      true,
      "Rebuild an empty history from the current tracked CSVs",
    );
  } finally {
    await db.close();
  }
});
