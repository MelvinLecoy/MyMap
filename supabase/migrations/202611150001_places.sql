begin;

create table if not exists public.places (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  name text not null check (length(name) > 0),
  continent text not null default '',
  region text not null default '',
  subregion text not null default '',
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  map_embed_url text,
  map_viewer_url text,
  map_status text not null check (map_status in ('Complete','Update','Unfinished','Not Started')),
  visit_status text not null default 'unknown' check (visit_status in ('visited','planned','not-visited','unknown')),
  last_visited text check (atlas_private.valid_visit_date(last_visited)),
  notes text not null default '',
  pin_color text check (pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  outline jsonb not null check (jsonb_typeof(outline)='object' and outline->>'type' in ('Polygon','MultiPolygon') and jsonb_typeof(outline->'coordinates')='array'),
  outline_source text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (last_visited is null or visit_status='visited'),
  check ((map_embed_url is null and map_viewer_url is null) or (map_embed_url is not null and map_viewer_url is not null and map_embed_url ~ '^https://(www\.)?google\.com/maps/d/' and map_viewer_url ~ '^https://(www\.)?google\.com/maps/d/'))
);
create table if not exists public.place_countries (
  place_id text not null references public.places(id) on delete cascade,
  country_code text not null references public.countries(code),
  position integer not null check (position > 0),
  primary key (place_id, country_code),
  unique (place_id, position)
);

create or replace function atlas_private.touch_place()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at := clock_timestamp(); return new; end;
$$;
drop trigger if exists touch_place on public.places;
create trigger touch_place before update on public.places for each row execute function atlas_private.touch_place();

alter table public.places enable row level security;
alter table public.place_countries enable row level security;
revoke all on public.places, public.place_countries from public, anon, authenticated;
grant select on public.places, public.place_countries to anon, authenticated;
grant update (map_status) on public.places to authenticated;
drop policy if exists atlas_places_read on public.places;
create policy atlas_places_read on public.places for select to anon, authenticated using (true);
drop policy if exists atlas_place_countries_read on public.place_countries;
create policy atlas_place_countries_read on public.place_countries for select to anon, authenticated using (true);
drop policy if exists atlas_places_owner_update on public.places;
create policy atlas_places_owner_update on public.places for update to authenticated using ((select public.atlas_can_edit())) with check ((select public.atlas_can_edit()));

create or replace function public.atlas_places_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(p) || jsonb_build_object('countries', coalesce((
  select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name) order by pc.position)
  from public.place_countries pc join public.countries c on c.code=pc.country_code where pc.place_id=p.id
), '[]'::jsonb)) order by p.name, p.id), '[]'::jsonb) from public.places p;
$$;
revoke all on function public.atlas_places_snapshot() from public;
grant execute on function public.atlas_places_snapshot() to anon, authenticated;

commit;
