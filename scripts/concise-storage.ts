import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { countryInputReferences } from "./collection-inputs";
import { collectionBusinessSnapshotSql } from "./backend-architecture";

export const CONCISE_STORAGE_VERSION = "202611160002";
const migrationPath = "supabase/migrations/202611160002_concise_storage.sql";
const json = (value: unknown) =>
  `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;

/** The existing API is the exact parity contract while storage becomes lean. */
export function conciseStorageSql(rollback = false) {
  const migration = readFileSync(migrationPath, "utf8");
  const checksum = createHash("sha256").update(migration).digest("hex");
  const body = migration
    .replace(/^\s*begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  const reference = [...countryInputReferences().values()].map((r) => ({
    code: r.code,
    region: r.region,
    subregion: r.subregion,
    city_label: r.cityLabel,
  }));
  return {
    version: CONCISE_STORAGE_VERSION,
    checksum,
    sql: `begin;
set local lock_timeout='5s';
set local statement_timeout='60s';
select pg_advisory_xact_lock(202611160002);
lock table public.cities,public.countries,public.city_visits,public.city_visit_periods,
 public.country_visits,public.country_visit_periods,public.places,public.place_countries in share row exclusive mode;
create table if not exists atlas_private.schema_migrations(
 version text primary key,checksum text not null check(checksum ~ '^[0-9a-f]{64}$'),
 applied_at timestamptz not null default clock_timestamp());
revoke all on atlas_private.schema_migrations from public,anon,authenticated;
create temporary table concise_business_before on commit drop as select ${collectionBusinessSnapshotSql} as data;
create temporary table concise_country_reference on commit drop as select * from jsonb_to_recordset(${json(reference)})
 as r(code text,region text,subregion text,city_label text);
do $install$ begin
 if exists(select 1 from atlas_private.schema_migrations where version='${CONCISE_STORAGE_VERSION}' and checksum<>'${checksum}')
 then raise exception 'Applied concise migration checksum changed; use a new migration.'; end if;
 if not exists(select 1 from atlas_private.schema_migrations where version='${CONCISE_STORAGE_VERSION}') then
  execute $concise_implementation$${body}$concise_implementation$;
 end if;
end $install$;
set constraints all immediate;
do $parity$ begin
 if (select data from concise_business_before) is distinct from ${collectionBusinessSnapshotSql}
 then raise exception 'Concise storage did not reproduce every legacy business field; rolling back.'; end if;
 if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='atlas_data' and c.relkind='r' and c.relname in
  ('cities','countries','city_visits','city_visit_periods','country_visits','country_visit_periods','places','place_countries')
  and (not c.relrowsecurity or not has_table_privilege('anon',c.oid,'SELECT')
    or has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') or has_any_column_privilege('anon',c.oid,'UPDATE')))
 then raise exception 'Canonical storage lost its public read-only RLS contract.'; end if;
 if (select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='atlas_data' and c.relkind='r') <> 8
 then raise exception 'Expected exactly eight canonical business tables.'; end if;
end $parity$;
insert into atlas_private.schema_migrations(version,checksum) values('${CONCISE_STORAGE_VERSION}','${checksum}') on conflict(version) do nothing;
${rollback ? "rollback" : "commit"};`,
  };
}
