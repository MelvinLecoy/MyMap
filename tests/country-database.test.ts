import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import {
  countryCollection,
  countryDatabaseSql,
  countrySeedSql,
} from "../scripts/country-database";
import {
  fromCountrySnapshot,
  toCountrySnapshot,
} from "../src/lib/country-cloud-data";

test("country schema, import, snapshot, permissions, integrity and reimport work in real PostgreSQL", async () => {
  const db = new PGlite();
  const owner = "11111111-1111-4111-8111-111111111111",
    stranger = "22222222-2222-4222-8222-222222222222";
  const { snapshot, sql } = countryDatabaseSql();
  async function fails(sql: string, pattern: RegExp) {
    try {
      await assert.rejects(
        db.exec(`begin;${sql};set constraints all immediate;commit;`),
        pattern,
      );
    } finally {
      await db.exec("rollback;");
    }
  }
  try {
    await db.exec(`create schema auth;create table auth.users(id uuid primary key);create role anon;create role authenticated;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated;insert into auth.users values('${owner}'),('${stranger}');`);
    await db.exec(
      readFileSync("supabase/migrations/202611120001_atlas.sql", "utf8"),
    );
    await db.exec(`insert into atlas_private.editors values('${owner}');`);
    await db.exec(sql);
    const fetch = async () =>
      fromCountrySnapshot(
        (
          await db.query<{ data: unknown }>(
            "select atlas_country_snapshot() as data",
          )
        ).rows[0].data,
      );
    assert.deepEqual(
      toCountrySnapshot(await fetch()),
      toCountrySnapshot(
        [...countryCollection()].sort((a, b) => a.code.localeCompare(b.code)),
      ),
    );
    assert.deepEqual(
      (
        await db.query(
          "select count(*)::int as n,sum(coalesce(days_spent,departure_date-arrival_date+1))::float8 as days from country_visit_periods",
        )
      ).rows[0],
      { n: 127, days: 273.5 },
    );
    await db.exec(sql); // Full migration and seed are repeatable.
    await db.exec("set role anon;");
    assert.equal((await fetch()).length, snapshot.countries.length);
    await fails(
      "update countries set notes='intruder' where code='GB'",
      /permission denied/,
    );
    await fails(
      "delete from country_visit_periods where country_code='GB'",
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    assert.equal(
      (
        await db.query(
          "update countries set notes='intruder' where code='GB' returning code",
        )
      ).rows.length,
      0,
    );
    await fails(
      "insert into country_visits(country_code,visit_number)values('GB',4)",
      /row-level security/,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    await fails(
      "update countries set code='XX' where code='GB'",
      /permission denied/,
    );
    await fails(
      "insert into country_visit_periods values('GB',99,1,'2026-01-01','2026-01-01','','')",
      /foreign key/,
    );
    await fails(
      "update country_visits set days_spent=11 where country_code='AU' and visit_number=1",
      /disagree/,
    );
    await fails(
      "update country_visits set days_spent=null where country_code='NZ';update country_visit_periods set arrival_date='2025-07-29' where country_code='NZ' and period_number=2",
      /overlap/,
    );
    await fails(
      "update country_visits set arrival_date='2026-08-09',days_spent=null where country_code='AE' and visit_number=3;update country_visit_periods set arrival_date='2026-08-09' where country_code='AE' and visit_number=3",
      /14-day/,
    );
    await fails(
      "update countries set times_visited=1 where code='GB'",
      /smaller/,
    );
    await fails(
      "update country_visits set departure_date='2024-02-30' where country_code='GB' and visit_number=1",
      /check constraint/,
    );
    const before = snapshot.countries.find((c) => c.code === "GB")!.notes;
    await db.exec(
      "update countries set notes='Owner edit retained' where code='GB';reset role;",
    );
    await fails(countrySeedSql(snapshot), /export and review/);
    assert.equal(
      (
        await db.query<{ notes: string }>(
          "select notes from countries where code='GB'",
        )
      ).rows[0].notes,
      "Owner edit retained",
    );
    await db.query("update countries set notes=$1 where code='GB'", [before]);
    await db.exec(sql);
    assert.equal(
      (await fetch()).find((c) => c.code === "GB")!.recordedDaysSpent,
      12.5,
    );
  } finally {
    await db.close();
  }
});
