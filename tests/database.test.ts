import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { collectionRows, seedSql } from "../scripts/supabase-data.js";

const owner = "11111111-1111-4111-8111-111111111111";
const stranger = "22222222-2222-4222-8222-222222222222";
const migration = readFileSync(
  "supabase/migrations/202611120001_atlas.sql",
  "utf8",
);

test("real PostgreSQL enforces public reads, owner-only writes, validation, and safe reimports", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);
      create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${owner}'),('${stranger}');`);
    await db.exec(migration);
    await db.exec(`insert into atlas_private.editors values ('${owner}');`);
    const rows = collectionRows();
    await db.exec(seedSql(rows));
    await db.exec("set role anon;");
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from cities;",
        )
      ).rows[0].count,
      343,
    );
    await assert.rejects(
      db.exec(
        "update cities set map_status='Update' where id='moscow-russia';",
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.exec(
        "insert into cities(id,name,country,map_status) values('intruder','Intruder','X','Update');",
      ),
      /permission denied/i,
    );
    await assert.rejects(
      db.exec("delete from cities where id='moscow-russia';"),
      /permission denied/i,
    );
    await assert.rejects(
      db.exec("select * from atlas_private.editors;"),
      /permission denied/i,
    );
    await db.exec(
      `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${stranger}',false);`,
    );
    assert.equal(
      (
        await db.query<{ can_edit: boolean }>(
          "select atlas_can_edit() as can_edit;",
        )
      ).rows[0].can_edit,
      false,
    );
    assert.equal(
      (
        await db.query(
          "update cities set map_status='Update' where id='moscow-russia' returning id;",
        )
      ).rows.length,
      0,
    );
    await assert.rejects(
      db.exec("select * from atlas_private.editors;"),
      /permission denied/i,
    );
    await db.exec(
      `select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    assert.equal(
      (
        await db.query<{ can_edit: boolean }>(
          "select atlas_can_edit() as can_edit;",
        )
      ).rows[0].can_edit,
      true,
    );
    await db.exec(
      "update cities set map_status='Update' where id='moscow-russia';",
    );
    await assert.rejects(
      db.exec("update cities set name='Changed' where id='moscow-russia';"),
      /permission denied/i,
    );
    await assert.rejects(
      db.exec(
        "update cities set map_status='Invalid' where id='moscow-russia';",
      ),
      /check constraint/i,
    );
    await assert.rejects(
      db.exec(
        "update cities set last_visited='2025-02-30',visit_status='visited' where id='moscow-russia';",
      ),
      /check constraint|out of range/i,
    );
    await db.exec(
      "update cities set visit_status='visited',last_visited='2025' where id='moscow-russia';",
    );
    await db.exec("reset role;");
    await db.exec(seedSql(rows));
    const saved = (
      await db.query<{
        map_status: string;
        visit_status: string;
        last_visited: string;
      }>(
        "select map_status,visit_status,last_visited from cities where id='moscow-russia';",
      )
    ).rows[0];
    assert.deepEqual(saved, {
      map_status: "Update",
      visit_status: "visited",
      last_visited: "2025",
    });
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from cities where latitude is not null;",
        )
      ).rows[0].count,
      341,
    );
    // Applying the schema again must not remove the editor or saved progress.
    await db.exec(migration);
    assert.equal(
      (
        await db.query<{ count: number }>(
          "select count(*)::int as count from atlas_private.editors;",
        )
      ).rows[0].count,
      1,
    );
  } finally {
    await db.close();
  }
});

test("browser-status imports are atomic and reject stale snapshots", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create schema auth; create table auth.users(id uuid primary key);
      create role anon; create role authenticated;
      create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated;
      insert into auth.users values ('${owner}');`);
    await db.exec(migration);
    await db.exec(`insert into atlas_private.editors values ('${owner}');`);
    await db.exec(seedSql(collectionRows()));
    const before = (
      await db.query<{ id: string; updated_at: Date }>(
        "select id,updated_at from cities where id in ('moscow-russia','warsaw-poland') order by id;",
      )
    ).rows;
    const changes = before.map((row) => ({
      id: row.id,
      status: "Update",
      updated_at: row.updated_at.toISOString(),
    }));
    await db.exec(
      `set role authenticated; select set_config('request.jwt.claim.sub','${owner}',false);`,
    );
    const stale = [
      { ...changes[0] },
      { ...changes[1], updated_at: "2000-01-01T00:00:00Z" },
    ];
    await assert.rejects(
      db.query("select * from atlas_import_statuses($1::jsonb);", [
        JSON.stringify(stale),
      ]),
      /changed since/i,
    );
    assert.equal(
      (
        await db.query<{ map_status: string }>(
          "select map_status from cities where id='moscow-russia';",
        )
      ).rows[0].map_status,
      "Complete",
    );
    assert.equal(
      (
        await db.query("select * from atlas_import_statuses($1::jsonb);", [
          JSON.stringify(changes),
        ])
      ).rows.length,
      2,
    );
    await assert.rejects(
      db.query("select * from atlas_import_statuses($1::jsonb);", [
        JSON.stringify(changes),
      ]),
      /changed since/i,
    );
  } finally {
    await db.close();
  }
});
