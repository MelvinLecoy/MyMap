begin;

-- A compatibility boundary, not a destructive table normalization. Catalog
-- projections describe repository-owned reference fields. State projections
-- describe the currently persisted owner-editable fields and revisions. The
-- existing tables remain the only physical source for their editable values.
-- OFFSET 0 makes each projection non-updatable even if a future grant changes.
create or replace view public.atlas_city_catalog
with (security_invoker = true) as
select id, name, country, country_code, continent, region, subregion,
  longitude, latitude, map_embed_url, map_viewer_url
from public.cities offset 0;

create or replace view public.atlas_city_state
with (security_invoker = true) as
select id, map_status, visit_status, last_visited, notes, pin_color, updated_at
from public.cities offset 0;

create or replace view public.atlas_country_catalog
with (security_invoker = true) as
select code, name, continent, is_195, aliases
from public.countries offset 0;

create or replace view public.atlas_country_state
with (security_invoker = true) as
select code, visit_status, first_visit_order, times_visited, total_days_spent,
  visit_history_complete, notes, updated_at
from public.countries offset 0;

create or replace view public.atlas_place_catalog
with (security_invoker = true) as
select id, name, continent, region, subregion, longitude, latitude,
  map_embed_url, map_viewer_url, outline, outline_source
from public.places offset 0;

create or replace view public.atlas_place_state
with (security_invoker = true) as
select id, map_status, visit_status, last_visited, notes, pin_color, updated_at
from public.places offset 0;

revoke all on public.atlas_city_catalog, public.atlas_city_state,
  public.atlas_country_catalog, public.atlas_country_state,
  public.atlas_place_catalog, public.atlas_place_state
from public, anon, authenticated;
grant select on public.atlas_city_catalog, public.atlas_city_state,
  public.atlas_country_catalog, public.atlas_country_state,
  public.atlas_place_catalog, public.atlas_place_state
to anon, authenticated;

-- Keep nullable unknown-country records valid while enforcing known references.
-- Deferred checks permit one approved transaction to add a city before its
-- country/territory without permitting an orphan after that transaction commits.
do $city_country_reference$ begin
  if not exists(select 1 from pg_constraint
    where conrelid='public.cities'::regclass and conname='cities_country_code_fkey')
  then
    alter table public.cities add constraint cities_country_code_fkey
      foreign key (country_code) references public.countries(code)
      deferrable initially deferred;
  end if;
end $city_country_reference$;

-- Existing composite keys already index each history's parent lookups. These
-- reference/reverse lookups support country-to-city/place queries and foreign
-- key checks without a full scan of either relation.
create index if not exists place_countries_country_code_idx
  on public.place_countries (country_code);
create index if not exists cities_country_code_idx
  on public.cities (country_code);

-- All nested STABLE readers use this statement's MVCC snapshot. Preserve the
-- three legacy RPC shapes and write paths for old deployments and operators.
-- Explicitly select public collection readers: future private preferences and
-- visa records must never be swept into this public response automatically.
create or replace function public.atlas_collection_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'version', 1,
    'cities', public.atlas_city_snapshot(),
    'countries', public.atlas_country_snapshot(),
    'places', public.atlas_places_snapshot()
  );
$$;
revoke all on function public.atlas_collection_snapshot() from public;
grant execute on function public.atlas_collection_snapshot() to anon, authenticated;

comment on function public.atlas_collection_snapshot() is
  'Version 1 public collection read contract, one statement/revision; no private user data. Legacy readers and writes are retained.';
comment on view public.atlas_city_catalog is
  'Read-only invoker projection of reference fields; physical catalog/state normalization remains a later migration.';
comment on view public.atlas_country_catalog is
  'Read-only invoker projection of legacy reference fields; repository country classification is authoritative in the application.';
comment on view public.atlas_place_catalog is
  'Read-only invoker projection of reference fields; place/country membership remains public.place_countries.';

commit;
