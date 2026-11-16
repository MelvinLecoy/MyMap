import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const DATA_ARCHITECTURE_VERSION = "202611160001";
export const DATA_ARCHITECTURE_MIGRATION =
  "supabase/migrations/202611160001_data_architecture.sql";

/** Public business data only; intentionally excludes private account data. */
export const collectionBusinessSnapshotSql = `jsonb_build_object(
  'cities', public.atlas_city_snapshot(),
  'countries', public.atlas_country_snapshot(),
  'places', public.atlas_places_snapshot()
)`;

/** One transaction: preserve all current data and reject changed applied files. */
export function backendArchitectureSql(
  rollback = false,
  migration = readFileSync(DATA_ARCHITECTURE_MIGRATION, "utf8"),
) {
  const checksum = createHash("sha256").update(migration).digest("hex");
  const body = migration
    .replace(/^\s*begin;\s*/i, "")
    .replace(/commit;\s*$/i, "");
  return {
    version: DATA_ARCHITECTURE_VERSION,
    checksum,
    sql: `begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';
select pg_advisory_xact_lock(202611160001);
lock table public.cities, public.city_visit_periods, public.city_visits,
  public.countries, public.country_visit_periods, public.country_visits,
  public.place_countries, public.places in share mode;
create table if not exists atlas_private.schema_migrations (
  version text primary key,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default clock_timestamp()
);
revoke all on atlas_private.schema_migrations from public, anon, authenticated;
do $checksum$ begin
  if exists(select 1 from atlas_private.schema_migrations
    where version = '${DATA_ARCHITECTURE_VERSION}' and checksum <> '${checksum}')
  then raise exception 'Applied architecture migration checksum changed; create a new migration.';
  end if;
end $checksum$;
create temporary table architecture_business_before on commit drop as
  select ${collectionBusinessSnapshotSql} as data;
${body}
do $preserve$ begin
  if exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relkind='r' and c.relname in (
      'cities','city_visits','city_visit_periods','countries','country_visits',
      'country_visit_periods','places','place_countries') and (
        not c.relrowsecurity or not has_table_privilege('anon',c.oid,'SELECT')
        or has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE')
        or has_any_column_privilege('anon',c.oid,'UPDATE')))
  then raise exception 'Public collection read-only RLS contract changed; rolling back.';
  end if;
  if exists(select 1 from pg_proc where oid='public.atlas_collection_snapshot()'::regprocedure
    and (prosecdef or provolatile <> 's'))
  then raise exception 'Collection snapshot must remain a stable invoker reader; rolling back.';
  end if;
  if (select data from architecture_business_before)
    is distinct from ${collectionBusinessSnapshotSql}
  then raise exception 'Architecture migration changed existing business data; rolling back.';
  end if;
  if public.atlas_collection_snapshot()
    is distinct from (select data || '{"version":1}'::jsonb from architecture_business_before)
  then raise exception 'Collection snapshot contract differs from legacy readers; rolling back.';
  end if;
end $preserve$;
insert into atlas_private.schema_migrations(version,checksum)
  values ('${DATA_ARCHITECTURE_VERSION}','${checksum}') on conflict(version) do nothing;
${rollback ? "rollback" : "commit"};
`,
  };
}

/** Schema metadata and counts, never private user values or credentials. */
export const backendAuditSql = `select jsonb_build_object(
  'collection_rpc_present', to_regprocedure('public.atlas_collection_snapshot()') is not null,
  'tables', (select jsonb_agg(jsonb_build_object(
    'schema', n.nspname, 'name', c.relname, 'kind', c.relkind,
    'rls', c.relrowsecurity, 'force_rls', c.relforcerowsecurity,
    'view_options', c.reloptions
  ) order by n.nspname,c.relname)
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','v') and n.nspname in ('public','atlas_private','atlas_data')),
  'columns', (select jsonb_agg(jsonb_build_object(
    'schema',table_schema,'table',table_name,'column',column_name,
    'type',data_type,'nullable',is_nullable
  ) order by table_schema,table_name,ordinal_position)
    from information_schema.columns where table_schema in ('public','atlas_private','atlas_data')),
  'constraints', (select jsonb_agg(jsonb_build_object(
    'schema',n.nspname,'table',c.relname,'name',con.conname,
    'definition',pg_get_constraintdef(con.oid)
  ) order by n.nspname,c.relname,con.conname)
    from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','atlas_private','atlas_data')),
  'indexes', (select jsonb_agg(to_jsonb(i) order by schemaname,tablename,indexname)
    from pg_indexes i where schemaname in ('public','atlas_private','atlas_data')),
  'policies', (select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname)
    from pg_policies p where schemaname in ('public','atlas_private','atlas_data')),
  'public_access', (select jsonb_agg(jsonb_build_object(
    'table',c.relname,'rls',c.relrowsecurity,
    'read',has_table_privilege('anon',c.oid,'SELECT'),
    'write',has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE')
      or has_any_column_privilege('anon',c.oid,'UPDATE')
  ) order by c.relname) from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname=case when to_regclass('atlas_data.cities') is null then 'public' else 'atlas_data' end and c.relkind='r' and c.relname in (
      'cities','city_visits','city_visit_periods','countries','country_visits',
      'country_visit_periods','places','place_countries')),
  'snapshot_counts', jsonb_build_object(
    'cities',(select count(*) from public.cities),
    'city_visits',(select count(*) from public.city_visits),
    'city_periods',(select count(*) from public.city_visit_periods),
    'countries',(select count(*) from public.countries),
    'country_visits',(select count(*) from public.country_visits),
    'country_periods',(select count(*) from public.country_visit_periods),
    'places',(select count(*) from public.places),
    'place_countries',(select count(*) from public.place_countries)
  ),
  'business_fingerprint', md5((${collectionBusinessSnapshotSql})::text)
) as audit;`;
