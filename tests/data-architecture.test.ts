import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { backendArchitectureSql } from "../scripts/backend-architecture";

const migration = readFileSync(
  "supabase/migrations/202611160001_data_architecture.sql",
  "utf8",
);
const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const projections = [
  "atlas_city_catalog",
  "atlas_city_state",
  "atlas_country_catalog",
  "atlas_country_state",
  "atlas_place_catalog",
  "atlas_place_state",
];

async function database() {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key);
    create role anon; create role authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    grant usage on schema auth to authenticated;
    insert into auth.users values ('${owner}'), ('${stranger}');
  `);
  for (const file of [
    "202611120001_atlas.sql",
    "202611130001_country_history.sql",
    "202611130002_city_history.sql",
    "202611130003_country_half_days.sql",
    "202611140002_city_visit_periods.sql",
    "202611150001_places.sql",
  ])
    await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
  await db.exec(`
    insert into atlas_private.editors values ('${owner}');
    insert into public.countries(code,name,continent,visit_status)
      values('ZZ','Test country','Test continent','unknown');
    insert into public.cities(id,name,country,country_code,map_status)
      values ('visible-city','Visible city','Test country','ZZ','Complete'),
      ('hidden-city','Hidden city','Test country','ZZ','Not Started');
    insert into public.places(id,name,longitude,latitude,map_status,outline)
      values('test-place','Test place',0,0,'Update',
        '{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,0]]]}');
    insert into public.place_countries values('test-place','ZZ',1);
    create table atlas_private.audit_secret(value text);
    insert into atlas_private.audit_secret values ('private sentinel');
  `);
  return db;
}

async function legacy(db: PGlite) {
  return (
    await db.query<{ cities: unknown; countries: unknown; places: unknown }>(
      "select public.atlas_city_snapshot() as cities, public.atlas_country_snapshot() as countries, public.atlas_places_snapshot() as places",
    )
  ).rows[0];
}

test("the additive architecture migration preserves legacy reads and business data, and can be repeated", async () => {
  const db = await database();
  try {
    const before = await legacy(db);
    const definitions = async () =>
      (
        await db.query<{ name: string; definition: string }>(
          "select p.proname as name,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('atlas_city_snapshot','atlas_country_snapshot','atlas_places_snapshot','atlas_import_statuses') order by p.proname",
        )
      ).rows;
    const oldFunctions = await definitions();
    await db.exec(migration.replace(/commit;\s*$/i, "rollback;"));
    assert.equal(
      (
        await db.query<{ rpc: string | null }>(
          "select to_regprocedure('public.atlas_collection_snapshot()') as rpc",
        )
      ).rows[0].rpc,
      null,
    );
    assert.deepEqual(await legacy(db), before);
    await assert.rejects(
      db.exec(
        backendArchitectureSql(
          false,
          migration.replace(
            "commit;",
            "update public.cities set notes='unapproved';\ncommit;",
          ),
        ).sql,
      ),
      /changed existing business data/,
    );
    await db.exec("rollback");
    assert.deepEqual(await legacy(db), before);
    await assert.rejects(
      db.exec(
        backendArchitectureSql(
          false,
          migration.replace(
            "commit;",
            "grant update on public.cities to anon;\ncommit;",
          ),
        ).sql,
      ),
      /read-only RLS contract changed/,
    );
    await db.exec("rollback");
    await db.exec(backendArchitectureSql().sql);
    assert.deepEqual(await legacy(db), before);
    assert.deepEqual(await definitions(), oldFunctions);
    assert.deepEqual(
      (
        await db.query<{ data: unknown }>(
          "select public.atlas_collection_snapshot() as data",
        )
      ).rows[0].data,
      { version: 1, ...before },
    );
    await db.exec(backendArchitectureSql().sql);
    assert.deepEqual(await legacy(db), before);
    const registry = (
      await db.query<{ version: string; checksum: string; applied_at: Date }>(
        "select version,checksum,applied_at from atlas_private.schema_migrations",
      )
    ).rows;
    assert.equal(registry.length, 1);
    assert.equal(registry[0].checksum, backendArchitectureSql().checksum);
    await assert.rejects(
      db.exec(
        backendArchitectureSql(false, migration + "\n-- changed applied file")
          .sql,
      ),
      /checksum changed/,
    );
    await db.exec("rollback");
    assert.deepEqual(
      (
        await db.query(
          "select version,checksum,applied_at from atlas_private.schema_migrations",
        )
      ).rows,
      registry,
    );
    assert.deepEqual(await legacy(db), before);
    const functionFlags = (
      await db.query<{
        volatility: string;
        security_definer: boolean;
        language: string;
      }>(
        "select p.provolatile as volatility,p.prosecdef as security_definer,l.lanname as language from pg_proc p join pg_language l on l.oid=p.prolang where p.oid='public.atlas_collection_snapshot()'::regprocedure",
      )
    ).rows[0];
    assert.deepEqual(functionFlags, {
      volatility: "s",
      security_definer: false,
      language: "sql",
    });
  } finally {
    await db.close();
  }
});

test("catalog/state projections are read-only and preserve underlying RLS and existing owner writes", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    for (const name of projections) {
      const view = (
        await db.query<{ is_updatable: string; reloptions: string[] }>(
          "select v.is_updatable,c.reloptions from information_schema.views v join pg_class c on c.relname=v.table_name join pg_namespace n on n.oid=c.relnamespace and n.nspname=v.table_schema where v.table_schema='public' and v.table_name=$1",
          [name],
        )
      ).rows[0];
      assert.equal(view.is_updatable, "NO", name);
      assert.ok(view.reloptions.includes("security_invoker=true"), name);
    }
    await db.exec(`
      create policy architecture_hidden_city on public.cities as restrictive
        for select to anon using (id <> 'hidden-city');
      set role anon;
    `);
    assert.deepEqual(
      (await db.query("select id from public.atlas_city_catalog order by id"))
        .rows,
      [{ id: "visible-city" }],
    );
    const anonymous = (
      await db.query<{ data: { cities: { cities: { id: string }[] } } }>(
        "select public.atlas_collection_snapshot() as data",
      )
    ).rows[0].data;
    assert.deepEqual(
      anonymous.cities.cities.map((c) => c.id),
      ["visible-city"],
    );
    assert.ok(!JSON.stringify(anonymous).includes("private sentinel"));
    await assert.rejects(
      db.exec(
        "update public.atlas_city_state set map_status='Update' where id='visible-city'",
      ),
      /permission denied|cannot update view/,
    );
    await assert.rejects(
      db.exec(
        "update public.cities set map_status='Update' where id='visible-city'",
      ),
      /permission denied/,
    );
    await db.exec(
      `reset role;set role authenticated;select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    await db.exec(
      "update public.cities set map_status='Update' where id='visible-city'",
    );
    assert.equal(
      (
        await db.query<{ map_status: string }>(
          "select map_status from public.atlas_city_state where id='visible-city'",
        )
      ).rows[0].map_status,
      "Complete",
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const revision = (
      await db.query<{ updated_at: string }>(
        "select updated_at::text as updated_at from public.cities where id='visible-city'",
      )
    ).rows[0].updated_at;
    const changed = await db.query(
      "update public.cities set map_status='Update' where id='visible-city' and updated_at=$1 returning updated_at",
      [revision],
    );
    assert.equal(changed.rows.length, 1);
    assert.equal(
      (
        await db.query<{ map_status: string }>(
          "select map_status from public.atlas_city_state where id='visible-city'",
        )
      ).rows[0].map_status,
      "Update",
    );
    assert.equal(
      (
        await db.query(
          "update public.cities set map_status='Complete' where id='visible-city' and updated_at=$1 returning id",
          [revision],
        )
      ).rows.length,
      0,
      "Legacy optimistic updates still reject stale revisions",
    );
    await assert.rejects(
      db.exec(
        "update public.atlas_city_catalog set name='Changed' where id='visible-city'",
      ),
      /permission denied|cannot update view/,
    );
  } finally {
    await db.close();
  }
});

test("city country references reject orphans while allowing unknowns and atomic out-of-order additions", async () => {
  const db = await database();
  try {
    await db.exec(migration);
    await assert.rejects(
      db.exec(`begin;
        insert into public.cities(id,name,country,country_code,map_status)
          values('orphan','Orphan','Missing','YY','Not Started');
        commit;`),
      /cities_country_code_fkey/,
    );
    await db.exec("rollback");
    assert.equal(
      (await db.query("select id from public.cities where id='orphan'")).rows
        .length,
      0,
    );
    await db.exec(`begin;
      insert into public.cities(id,name,country,country_code,map_status)
        values('future-city','Future city','Future territory','YY','Not Started'),
          ('unknown-city','Unknown city','Unknown',null,'Not Started');
      insert into public.countries(code,name,continent,visit_status)
        values('YY','Future territory','Test continent','unknown');
      commit;`);
    assert.equal(
      (
        await db.query(
          "select id from public.cities where id in ('future-city','unknown-city')",
        )
      ).rows.length,
      2,
    );
    await assert.rejects(
      db.exec("begin;delete from public.countries where code='YY';commit;"),
      /cities_country_code_fkey/,
    );
    await db.exec("rollback");
  } finally {
    await db.close();
  }
});
