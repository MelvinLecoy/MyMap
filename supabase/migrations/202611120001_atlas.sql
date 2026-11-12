begin;

create schema if not exists atlas_private;
revoke all on schema atlas_private from public, anon, authenticated;

create table if not exists atlas_private.editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);
revoke all on atlas_private.editors from public, anon, authenticated;

create or replace function public.atlas_can_edit()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from atlas_private.editors
    where user_id = (select auth.uid())
  );
$$;
revoke all on function public.atlas_can_edit() from public, anon;
grant execute on function public.atlas_can_edit() to authenticated;

create or replace function atlas_private.valid_visit_date(value text)
returns boolean language plpgsql immutable set search_path = ''
as $$
declare full_date text;
begin
  if value is null then return true; end if;
  if value ~ '^[0-9]{4}$' then full_date := value || '-01-01';
  elsif value ~ '^[0-9]{4}-[0-9]{2}$' then full_date := value || '-01';
  elsif value ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then full_date := value;
  else return false;
  end if;
  return to_char(full_date::date, 'YYYY-MM-DD') = full_date;
exception when others then return false;
end;
$$;
-- Constraint checks need access to this validation function, not its schema's data.
grant usage on schema atlas_private to authenticated;
revoke all on function atlas_private.valid_visit_date(text) from public, anon;
grant execute on function atlas_private.valid_visit_date(text) to authenticated;

create table if not exists public.cities (
  id text primary key check (length(id) > 0),
  name text not null check (length(name) > 0),
  country text not null,
  country_code text check (country_code ~ '^[A-Z]{2}$'),
  continent text not null default '',
  region text not null default '',
  subregion text not null default '',
  longitude double precision,
  latitude double precision,
  map_embed_url text,
  map_viewer_url text,
  map_status text not null check (map_status in ('Complete','Update','Unfinished','Not Started')),
  visit_status text not null default 'not-visited'
    check (visit_status in ('visited','planned','not-visited','unknown')),
  last_visited text,
  notes text not null default '',
  pin_color text check (pin_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_coordinates check (
    (longitude is null and latitude is null)
    or (longitude is not null and latitude is not null
      and longitude between -180 and 180 and latitude between -90 and 90)
  ),
  constraint valid_map_links check (
    (map_embed_url is null and map_viewer_url is null)
    or (map_embed_url is not null and map_viewer_url is not null
      and map_embed_url ~ '^https://(www\.)?google\.com/maps/d/'
      and map_viewer_url ~ '^https://(www\.)?google\.com/maps/d/')
  ),
  constraint valid_last_visit check (atlas_private.valid_visit_date(last_visited)),
  constraint visit_date_matches_status check (last_visited is null or visit_status = 'visited')
);

create or replace function atlas_private.touch_city()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := clock_timestamp(); return new; end; $$;
drop trigger if exists touch_city on public.cities;
create trigger touch_city before update on public.cities
  for each row execute function atlas_private.touch_city();

alter table public.cities enable row level security;
revoke all on public.cities from public, anon, authenticated;
grant select on public.cities to anon, authenticated;
grant update (map_status, visit_status, last_visited, notes, pin_color)
  on public.cities to authenticated;

drop policy if exists atlas_public_read on public.cities;
create policy atlas_public_read on public.cities for select
  to anon, authenticated using (true);
drop policy if exists atlas_owner_update on public.cities;
create policy atlas_owner_update on public.cities for update
  to authenticated using ((select public.atlas_can_edit()))
  with check ((select public.atlas_can_edit()));

-- A migration is one owner action. It either saves every reviewed change or none.
create or replace function public.atlas_import_statuses(changes jsonb)
returns setof public.cities language plpgsql security invoker set search_path = ''
as $$
declare item jsonb; changed public.cities; seen text[] := '{}';
begin
  if not public.atlas_can_edit() then
    raise exception 'Only the atlas editor can import statuses.' using errcode = '42501';
  end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) > 1000 then
    raise exception 'Invalid status import.' using errcode = '22023';
  end if;
  for item in select * from jsonb_array_elements(changes) loop
    if item->>'id' is null or item->>'id' = any(seen)
      or item->>'status' is null or item->>'updated_at' is null then
      raise exception 'Invalid or duplicate city in import.' using errcode = '22023';
    end if;
    seen := array_append(seen, item->>'id');
    update public.cities set map_status = item->>'status'
      where id = item->>'id' and updated_at = (item->>'updated_at')::timestamptz
      returning * into changed;
    if not found then
      raise exception 'A city changed since the import was reviewed. Refresh and review again.'
        using errcode = '40001';
    end if;
    return next changed;
  end loop;
end;
$$;
revoke all on function public.atlas_import_statuses(jsonb) from public, anon;
grant execute on function public.atlas_import_statuses(jsonb) to authenticated;

commit;
