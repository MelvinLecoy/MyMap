import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { conciseStorageSql } from "../scripts/concise-storage";
import { seedSql, collectionRows } from "../scripts/supabase-data";
import { countryCollection, countrySeedSql } from "../scripts/country-database";
import { cityCollection, citySeedSql } from "../scripts/city-database";
import { toCountrySnapshot } from "../src/lib/country-cloud-data";
import { placeSeedSql } from "../scripts/sync-places";
import { backendArchitectureSql } from "../scripts/backend-architecture";
import { dataPersistenceSql } from "../scripts/data-persistence";
import { cityDatabaseSql } from "../scripts/city-database";
import { countryDatabaseSql } from "../scripts/country-database";
import { countryInputReferences } from "../scripts/collection-inputs";
import {
  countryGeographySyncPlan,
  geographySnapshotQuery,
  type GeographySnapshot,
} from "../scripts/sync-country-geography";

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
async function database() {
  const db = new PGlite();
  await db.exec(`create schema auth;create table auth.users(id uuid primary key);
 create role anon;create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated;
 insert into auth.users values('${owner}'),('${stranger}');`);
  for (const file of [
    "202611120001_atlas.sql",
    "202611130001_country_history.sql",
    "202611130002_city_history.sql",
    "202611130003_country_half_days.sql",
    "202611140002_city_visit_periods.sql",
    "202611150001_places.sql",
  ])
    await db.exec(readFileSync("supabase/migrations/" + file, "utf8"));
  await db.exec(
    `begin;insert into atlas_private.editors values('${owner}');${countrySeedSql(toCountrySnapshot(countryCollection()))}${seedSql(collectionRows())}${citySeedSql(cityCollection())}${placeSeedSql()}commit;`,
  );
  await db.exec(backendArchitectureSql().sql);
  return db;
}
async function snapshot(db: PGlite) {
  return (
    await db.query<{ data: unknown }>(
      "select public.atlas_collection_snapshot() as data",
    )
  ).rows[0].data;
}
async function migrate(db: PGlite, rollback = false) {
  try {
    await db.exec(conciseStorageSql(rollback).sql);
  } catch (error) {
    await db.exec("rollback");
    throw new Error((error as Error).message);
  }
}

test("concise physical storage reproduces every public city, country, stay, map and place field exactly", async () => {
  const db = await database();
  try {
    const before = await snapshot(db);
    await migrate(db, true);
    assert.deepEqual(await snapshot(db), before);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select to_regclass('atlas_data.cities')::text as name",
        )
      ).rows[0].name,
      null,
    );
    await migrate(db);
    assert.deepEqual(await snapshot(db), before);
    await migrate(db);
    assert.deepEqual(await snapshot(db), before);
    const cols = (
      await db.query<{ table_name: string; column_name: string }>(
        "select table_name,column_name from information_schema.columns where table_schema='atlas_data'",
      )
    ).rows;
    for (const column of [
      "country",
      "continent",
      "region",
      "subregion",
      "map_viewer_url",
      "last_visited",
    ])
      assert.equal(
        cols.some((c) => c.table_name === "cities" && c.column_name === column),
        false,
        column,
      );
    assert.deepEqual(
      cols
        .filter((c) => c.table_name === "city_visits")
        .map((c) => c.column_name)
        .sort(),
      ["city_id", "visit_number"],
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select count(*)::int as n from atlas_data.country_visits where arrival_override is not null or departure_override is not null or days_override is not null",
        )
      ).rows[0].n,
      0,
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select count(*)::int as n from atlas_data.cities where last_visit_override is not null",
        )
      ).rows[0].n,
      0,
    );
  } finally {
    await db.close();
  }
});

test("lean adapters preserve public read-only access, editor saves, revisions and atomic status imports", async () => {
  const db = await database();
  try {
    await migrate(db);
    await db.exec("set role anon;");
    assert.ok(await snapshot(db));
    await assert.rejects(
      db.exec(
        "update public.cities set map_status='Update' where id='london-uk'",
      ),
      /permission denied/,
    );
    await db.exec("reset role;");
    await db.exec(
      `set role authenticated;select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    await assert.rejects(
      db.exec(
        "update public.cities set map_status='Update' where id='london-uk'",
      ),
      /Only the atlas editor/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const before = (
      await db.query<{ updated_at: string }>(
        "select updated_at::text from public.cities where id='london-uk'",
      )
    ).rows[0];
    const saved = (
      await db.query<{ map_status: string; country: string }>(
        "update public.cities set map_status='Update' where id='london-uk' returning *",
      )
    ).rows[0];
    assert.equal(saved.map_status, "Update");
    assert.equal(saved.country, "UK");
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "update public.cities set map_status='Complete' where id='london-uk' and updated_at=$1 returning id",
          [before.updated_at],
        )
      ).rows.length,
      0,
    );
    const fresh = (
      await db.query<{ updated_at: string }>(
        "select updated_at::text from public.cities where id='london-uk'",
      )
    ).rows[0];
    const rows = (
      await db.query<{ map_status: string }>(
        "select * from public.atlas_import_statuses($1::jsonb)",
        [
          JSON.stringify([
            {
              id: "london-uk",
              status: "Complete",
              updated_at: fresh.updated_at,
            },
          ]),
        ],
      )
    ).rows;
    assert.equal(rows[0].map_status, "Complete");
    await db.exec(
      "update public.places set map_status='Update' where id='patagonia';",
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select map_status from public.places where id='patagonia'",
        )
      ).rows[0].map_status,
      "Update",
    );
  } finally {
    await db.close();
  }
});

test("derived summaries preserve deferred history edits, exact halves and invalid-summary rejection", async () => {
  const db = await database();
  try {
    await migrate(db);
    await db.exec(`begin;insert into public.cities(id,name,country,country_code,continent,region,subregion,map_status,visit_status,last_visited)
   values('test-city','Test city','UK','GB','Europe','British Isles','','Not Started','visited','2026-01-02');
   insert into public.city_visits values('test-city',1,'2026-01-01','2026-01-02',1.5);
   insert into public.city_visit_periods values('test-city',1,1,'2026-01-01','2026-01-02',1.5);commit;`);
    assert.equal(
      (
        await db.query<{ last_visit_override: unknown }>(
          "select last_visit_override from atlas_data.cities where id='test-city'",
        )
      ).rows[0].last_visit_override,
      null,
    );
    await db.exec(`begin;update public.city_visits set departure_date='2026-01-03',days_spent=2.5 where city_id='test-city';
   update public.city_visit_periods set departure_date='2026-01-03',days_spent=2.5 where city_id='test-city';commit;`);
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select last_visited from public.cities where id='test-city'",
        )
      ).rows[0].last_visited,
      "2026-01-03",
    );
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select days_spent from public.city_visits where city_id='test-city'",
        )
      ).rows[0].days_spent,
      "2.5",
    );
    await assert.rejects(
      db.exec(
        "begin;update public.city_visits set days_spent=3 where city_id='test-city';commit;",
      ),
      /summary differs/,
    );
    await db.exec("rollback");
    assert.equal(
      (
        await db.query<Record<string, unknown>>(
          "select days_spent from public.city_visits where city_id='test-city'",
        )
      ).rows[0].days_spent,
      "2.5",
    );
    const country = (
      await db.query<Record<string, unknown>>(
        "select * from public.country_visits where country_code='US'",
      )
    ).rows[0];
    assert.equal(country.arrival_date, null);
    assert.equal(country.days_spent, null);
    await db.exec(`begin;update public.country_visits set departure_date='2026-05-04',days_spent=3.5
    where country_code='GB' and visit_number=3;
    update public.country_visit_periods set departure_date='2026-05-04',days_spent=3.5
    where country_code='GB' and visit_number=3;commit;`);
    assert.equal(
      (
        await db.query<{ days_spent: string }>(
          "select days_spent from public.country_visits where country_code='GB' and visit_number=3",
        )
      ).rows[0].days_spent,
      "3.5",
    );
    assert.equal(
      (
        await db.query<{ days_override: unknown }>(
          "select days_override from atlas_data.country_visits where country_code='GB' and visit_number=3",
        )
      ).rows[0].days_override,
      null,
    );
    await db.exec(
      "begin;update public.country_visits set arrival_date='2022' where country_code='US';commit;",
    );
    assert.equal(
      (
        await db.query<{ arrival_override: string }>(
          "select arrival_override from atlas_data.country_visits where country_code='US'",
        )
      ).rows[0].arrival_override,
      "2022",
    );
    await db.exec(`insert into public.cities(id,name,country,country_code,continent,region,subregion,map_status,visit_status,last_visited)
    values('unclassified-city','Unclassified city','Independent label',null,'Independent continent','Independent region','','Not Started','visited','2020');`);
    const independent = (
      await db.query<{ country: string; region: string; last_visited: string }>(
        "select * from public.cities where id='unclassified-city'",
      )
    ).rows[0];
    assert.equal(independent.country, "Independent label");
    assert.equal(independent.region, "Independent region");
    assert.equal(independent.last_visited, "2020");
  } finally {
    await db.close();
  }
});

test("existing import and verification operators remain idempotent against concise tables", async () => {
  const db = await database();
  try {
    await migrate(db);
    const before = await snapshot(db);
    for (const sql of [
      dataPersistenceSql().sql,
      cityDatabaseSql().sql,
      countryDatabaseSql().sql,
      `begin;${placeSeedSql()}commit;`,
    ]) {
      await db.exec(sql);
      assert.deepEqual(await snapshot(db), before);
    }
    const rows = (
      await db.query<{ snapshot: GeographySnapshot }>(geographySnapshotQuery)
    ).rows[0].snapshot;
    const reference = [...countryInputReferences().values()]
      .filter((row) => row.code !== "SJ")
      .map((row) => ({
        ...row,
        region: row.code === "GB" ? "Updated region" : row.region,
      }));
    const plan = countryGeographySyncPlan(rows, reference, collectionRows());
    await db.exec(plan.sql);
    const region = (
      await db.query<{ region: string }>(
        "select region from public.cities where id='london-uk'",
      )
    ).rows[0].region;
    assert.equal(region, "Updated region");
  } finally {
    await db.close();
  }
});
