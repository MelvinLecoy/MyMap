import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import {
  approvedPlaces,
  placeReferenceData,
  placeSeedSql,
} from "../scripts/sync-places";
import {
  fromPlaceRow,
  outlineContains,
  placeBounds,
  type PlaceRow,
} from "../src/lib/places";
import { toCityRow } from "../src/lib/cloud-data";

const patagonia = approvedPlaces[0];
const asRow = (): PlaceRow => ({
  ...toCityRow(patagonia),
  countries: patagonia.countries,
  outline: structuredClone(patagonia.outline),
  outline_source: patagonia.outlineSource,
});

test("Patagonia is a distinct place spanning both countries with no invented map or visit history", () => {
  assert.equal(approvedPlaces.length, 1);
  assert.equal(patagonia.kind, "place");
  assert.equal(patagonia.name, "Patagonia");
  assert.deepEqual(patagonia.countries, [
    { code: "AR", name: "Argentina" },
    { code: "CL", name: "Chile" },
  ]);
  assert.equal(patagonia.map, null);
  assert.equal(patagonia.status, "Not Started");
  assert.equal(patagonia.visit, "unknown");
  assert.deepEqual(patagonia.visits, []);
  assert.equal(
    outlineContains(patagonia.outline, patagonia.coordinates!),
    true,
  );
  assert.equal(outlineContains(patagonia.outline, [-72.3, -50.34]), true);
  assert.equal(outlineContains(patagonia.outline, [-72.5, -51.72]), true);
  assert.equal(outlineContains(patagonia.outline, [-58.38, -34.6]), false);
  assert.equal(outlineContains(patagonia.outline, [-70.67, -33.45]), false);
  assert.equal(outlineContains(patagonia.outline, [-65, -65]), false);
  const bounds = placeBounds(patagonia)!;
  assert.ok(bounds[0][0] < -73 && bounds[0][1] < -55 && bounds[1][1] > -40);
  const metadata = JSON.parse(
    readFileSync("data/sources/patagonia-outline.json", "utf8"),
  );
  assert.equal(
    createHash("sha256")
      .update(JSON.stringify(patagonia.outline))
      .digest("hex"),
    metadata.geometrySha256,
  );
});

test("place parsing rejects missing countries, broken outlines and pins outside their area", () => {
  assert.throws(
    () => fromPlaceRow({ ...asRow(), countries: [] }),
    /invalid place/,
  );
  assert.throws(
    () =>
      fromPlaceRow({
        ...asRow(),
        countries: [patagonia.countries[0], patagonia.countries[0]],
      }),
    /invalid place/,
  );
  assert.throws(
    () => fromPlaceRow({ ...asRow(), longitude: -58.38, latitude: -34.6 }),
    /inside its outline/,
  );
  const row = asRow();
  if (row.outline.type === "MultiPolygon") row.outline.coordinates[0][0].pop();
  else row.outline.coordinates[0].pop();
  assert.throws(() => fromPlaceRow(row), /invalid place/);
});

test("place persistence is separate from city records and enforces public-read owner-update permissions", async () => {
  const db = new PGlite();
  const owner = "00000000-0000-0000-0000-000000000001";
  try {
    await db.exec(
      `create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$; grant usage on schema auth to authenticated; insert into auth.users values('${owner}');`,
    );
    await db.exec(
      readFileSync("supabase/migrations/202611120001_atlas.sql", "utf8"),
    );
    await db.exec(
      readFileSync(
        "supabase/migrations/202611130001_country_history.sql",
        "utf8",
      ),
    );
    await db.exec(
      `insert into public.countries(code,name,continent,is_195,visit_status) values ('AR','Argentina','South America',true,'visited'),('CL','Chile','South America',true,'visited'); insert into public.cities(id,name,country,country_code,map_status) values ('ordinary-city','Ordinary city','Argentina','AR','Complete'); insert into atlas_private.editors values('${owner}');`,
    );
    const before = await db.query("select * from public.cities");
    await db.exec(
      readFileSync("supabase/migrations/202611150001_places.sql", "utf8"),
    );
    await db.exec(placeSeedSql());
    assert.deepEqual(
      (await db.query("select * from public.cities")).rows,
      before.rows,
    );
    await db.exec("set role anon");
    const result = await db.query<{ places: PlaceRow[] }>(
      "select public.atlas_places_snapshot() as places",
    );
    assert.deepEqual(result.rows[0].places.map(fromPlaceRow), approvedPlaces);
    await assert.rejects(
      db.exec(
        "update public.places set map_status='Complete' where id='patagonia'",
      ),
      /permission denied/,
    );
    await db.exec(
      `reset role; set request.jwt.claim.sub='${owner}'; set role authenticated;`,
    );
    const saved = await db.query<{ map_status: string }>(
      "update public.places set map_status='Complete' where id='patagonia' returning map_status",
    );
    assert.equal(saved.rows[0].map_status, "Complete");
    await assert.rejects(
      db.exec("update public.places set name='Changed' where id='patagonia'"),
      /permission denied/,
    );
    await db.exec("reset role");
    await db.exec(`update public.places set
      map_embed_url='https://www.google.com/maps/d/embed?mid=owner-map',
      map_viewer_url='https://www.google.com/maps/d/viewer?mid=owner-map',
      visit_status='visited',last_visited='2026-08-01',
      notes='Owner note, with punctuation',pin_color='#123456'
      where id='patagonia'`);
    const editableColumns =
      "map_status,map_embed_url,map_viewer_url,visit_status,last_visited,notes,pin_color";
    const savedState = (
      await db.query(`select ${editableColumns} from public.places`)
    ).rows;
    const beforeRefresh = (await db.query("select * from public.places")).rows;
    await db.exec(placeSeedSql());
    assert.deepEqual(
      (await db.query("select * from public.places")).rows,
      beforeRefresh,
      "Repeated reference imports must preserve owner state and revision timestamps",
    );
    const refreshed = {
      ...patagonia,
      name: "Patagonia reference update",
      outlineSource: "Updated reference source",
    };
    await db.exec(placeSeedSql([refreshed]));
    assert.deepEqual(
      (await db.query(`select ${editableColumns} from public.places`)).rows,
      savedState,
      "Changing reference metadata must not reset any editable place field",
    );
    const snapshot = await db.query<{ places: PlaceRow[] }>(
      "select public.atlas_places_snapshot() as places",
    );
    assert.deepEqual(
      snapshot.rows[0].places.map(fromPlaceRow).map(placeReferenceData),
      [placeReferenceData(refreshed)],
    );
    assert.deepEqual(
      (await db.query("select * from public.cities")).rows,
      before.rows,
    );
    assert.equal(
      (await db.query("select * from public.place_countries")).rows.length,
      2,
    );
  } finally {
    await db.close();
  }
});
