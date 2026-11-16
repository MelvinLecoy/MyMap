import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import {
  countryGeographySyncPlan,
  geographySnapshotQuery,
  type GeographySnapshot,
} from "../scripts/sync-country-geography";

const reference = [
  {
    code: "FR",
    name: "France",
    continent: "Europe",
    region: "Western Europe",
    subregion: "",
  },
  {
    code: "GB",
    name: "United Kingdom",
    continent: "Europe",
    region: "British Isles",
    subregion: "",
  },
];
const identities = [
  { id: "paris", country_code: "FR" },
  { id: "london", country_code: "GB" },
  { id: "longyearbyen", country_code: "SJ" },
];
async function fixture() {
  const db = new PGlite();
  await db.exec(`
    create table countries(code text primary key,continent text,notes text);
    create table cities(id text primary key,country_code text references countries(code),name text,continent text,region text,subregion text,map_status text,visit_status text,notes text,map_viewer_url text,longitude float,latitude float,created_at timestamptz default '2020-01-01',updated_at timestamptz default '2020-01-01');
    create table city_visits(city_id text references cities(id),visit_number integer,days_spent numeric,primary key(city_id,visit_number));
    create table city_visit_periods(city_id text,visit_number integer,period_number integer,days_spent numeric,primary key(city_id,visit_number,period_number),foreign key(city_id,visit_number) references city_visits(city_id,visit_number));
    create table country_visits(country_code text references countries(code),visit_number integer,days_spent numeric,primary key(country_code,visit_number));
    create table country_visit_periods(country_code text,visit_number integer,period_number integer,days_spent numeric,primary key(country_code,visit_number,period_number),foreign key(country_code,visit_number) references country_visits(country_code,visit_number));
    create table places(id text primary key,notes text,outline jsonb);
    create table place_countries(place_id text references places(id),country_code text references countries(code),position integer,primary key(place_id,country_code));
    create function touch_city() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
    create trigger touch_city before update on cities for each row execute function touch_city();
    insert into countries values('FR','Europe','country notes'),('GB','Europe',''),('SJ','Europe','territory unchanged');
    insert into cities(id,country_code,name,continent,region,subregion,map_status,visit_status,notes,map_viewer_url,longitude,latitude)
      values('paris','FR','Paris','Europe','Old classification','Old subregion','Update','visited','owner''s $taxonomy_guard$ note','https://maps.example/paris',2.35,48.86),
        ('london','GB','London','Europe','Northern Europe','UK','Complete','visited','Keep this','https://maps.example/london',-0.13,51.51),
        ('longyearbyen','SJ','Longyearbyen','Europe','Arctic','Existing territory classification','Not Started','unknown','Preserve','',null,null);
    insert into city_visits values('paris',1,2.5);
    insert into city_visit_periods values('paris',1,1,2.5);
    insert into country_visits values('FR',1,3.5);
    insert into country_visit_periods values('FR',1,1,3.5);
    insert into places values('area','Keep area notes','{"type":"Polygon"}');
    insert into place_countries values('area','FR',1),('area','GB',2);
  `);
  const load = async () =>
    (await db.query<{ snapshot: GeographySnapshot }>(geographySnapshotQuery))
      .rows[0].snapshot;
  return { db, load };
}

test("country geography replaces only the reviewed city fields, preserves all eight tables, and reimports without revision churn", async () => {
  const { db, load } = await fixture();
  try {
    const before = await load();
    const plan = countryGeographySyncPlan(before, reference, identities);
    assert.equal(plan.changes.length, 2);
    await db.exec(plan.sql.replace(/commit;\s*$/i, "rollback;"));
    assert.deepEqual(
      await load(),
      before,
      "dry run must leave the database identical",
    );
    await db.exec(plan.sql);
    const after = await load();
    assert.deepEqual(
      after.cities.find((city) => city.id === "longyearbyen"),
      before.cities.find((city) => city.id === "longyearbyen"),
    );
    for (const table of Object.keys(before) as (keyof GeographySnapshot)[])
      if (table !== "cities")
        assert.deepEqual(after[table], before[table], table);
    for (const city of after.cities) {
      const previous = before.cities.find((row) => row.id === city.id)!;
      for (const key of Object.keys(previous))
        if (!["continent", "region", "subregion", "updated_at"].includes(key))
          assert.deepEqual(city[key], previous[key], `${city.id}.${key}`);
    }
    assert.equal(
      after.cities.find((city) => city.id === "paris")!.region,
      "Western Europe",
    );
    assert.equal(
      after.cities.find((city) => city.id === "london")!.region,
      "British Isles",
    );
    assert.equal(
      after.cities.find((city) => city.id === "london")!.subregion,
      "",
      "blank workbook fields clear old classifications",
    );
    const noop = countryGeographySyncPlan(after, reference, identities);
    assert.equal(noop.changes.length, 0);
    await db.exec(noop.sql);
    assert.deepEqual(
      await load(),
      after,
      "unchanged rows must retain their revisions",
    );
  } finally {
    await db.close();
  }
});

test("a fresh geography review refuses stale revisions and retains a concurrent owner edit", async () => {
  const { db, load } = await fixture();
  try {
    const plan = countryGeographySyncPlan(await load(), reference, identities);
    await db.exec(
      "update cities set notes='Saved online after review' where id='paris';",
    );
    const edited = await load();
    await assert.rejects(db.exec(plan.sql), /changed since geography review/i);
    await db.exec("rollback;");
    assert.deepEqual(await load(), edited);
  } finally {
    await db.close();
  }
});

test("unexpected changes by a database trigger roll the entire taxonomy update back", async () => {
  const { db, load } = await fixture();
  try {
    const before = await load();
    await db.exec(`create function unexpected_change() returns trigger language plpgsql as $$begin update countries set notes='Unexpected modification' where code='FR';return new;end$$;
      create trigger unexpected_change after update on cities for each row execute function unexpected_change();`);
    const plan = countryGeographySyncPlan(before, reference, identities);
    await assert.rejects(
      db.exec(plan.sql),
      /changed unrelated country, history or place/i,
    );
    await db.exec("rollback;");
    assert.deepEqual(await load(), before);
  } finally {
    await db.close();
  }
});

test("geography preparation rejects missing/extra identities and unknown codes before producing any SQL", async () => {
  const { db, load } = await fixture();
  try {
    const snapshot = await load();
    assert.throws(
      () => countryGeographySyncPlan(snapshot, reference, identities.slice(1)),
      /city identities/i,
    );
    const missing = structuredClone(snapshot);
    missing.cities.pop();
    assert.throws(
      () => countryGeographySyncPlan(missing, reference, identities),
      /city identities/i,
    );
    const unknown = structuredClone(snapshot);
    unknown.cities[0].country_code = "ZZ";
    assert.throws(
      () => countryGeographySyncPlan(unknown, reference, identities),
      /city identities/i,
    );
    const unexpected = structuredClone(snapshot);
    unexpected.countries.push({ code: "ZZ", continent: "Europe" });
    assert.throws(
      () => countryGeographySyncPlan(unexpected, reference, identities),
      /country identities/i,
    );
    assert.deepEqual(await load(), snapshot);
  } finally {
    await db.close();
  }
});
