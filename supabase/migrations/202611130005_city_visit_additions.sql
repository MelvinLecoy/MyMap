-- Add 12 owner-approved visited cities (13 dated stays), preserving map edits.
-- This additive change is independent of the previous four-city corrections.
-- Reapplication is safe; unexpected existing visits or changed dates cause rollback.
begin;
select pg_advisory_xact_lock(202611130005);

create temporary table approved_additional_cities (
  city_id text primary key, name text not null, country_code text not null, last_visited date not null
) on commit drop;
insert into approved_additional_cities values
  ('austin-usa', 'Austin', 'US', date '2024-12-16'),
  ('baltimore-usa', 'Baltimore', 'US', date '2026-07-11'),
  ('dallas-usa', 'Dallas', 'US', date '2025-04-02'),
  ('denver-usa', 'Denver', 'US', date '2024-12-15'),
  ('montego-bay-jamaica', 'Montego Bay', 'JM', date '2026-07-12'),
  ('ottawa-canada', 'Ottawa', 'CA', date '2026-07-11'),
  ('san-antonio-usa', 'San Antonio', 'US', date '2024-12-16'),
  ('san-diego-usa', 'San Diego', 'US', date '2026-04-05'),
  ('san-pedro-sula-honduras', 'San Pedro Sula', 'HN', date '2026-09-26'),
  ('santo-domingo-dominican-republic', 'Santo Domingo', 'DO', date '2026-07-15'),
  ('seattle-usa', 'Seattle', 'US', date '2022-07-18'),
  ('tijuana-mexico', 'Tijuana', 'MX', date '2026-04-04');

create temporary table approved_additional_visits (
  city_id text not null, visit_number integer not null,
  arrival_date date not null, departure_date date not null,
  days_spent numeric not null, primary key (city_id, visit_number)
) on commit drop;
insert into approved_additional_visits values
  ('austin-usa', 1, date '2024-12-16', date '2024-12-16', 1),
  ('baltimore-usa', 1, date '2026-07-11', date '2026-07-11', 1),
  ('dallas-usa', 1, date '2024-12-17', date '2024-12-17', 1),
  ('dallas-usa', 2, date '2025-04-02', date '2025-04-02', 1),
  ('denver-usa', 1, date '2024-12-14', date '2024-12-15', 2),
  ('montego-bay-jamaica', 1, date '2026-07-12', date '2026-07-12', 1),
  ('ottawa-canada', 1, date '2026-07-11', date '2026-07-11', 1),
  ('san-antonio-usa', 1, date '2024-12-16', date '2024-12-16', 1),
  ('san-diego-usa', 1, date '2026-04-04', date '2026-04-05', 2),
  ('san-pedro-sula-honduras', 1, date '2026-09-26', date '2026-09-26', 1),
  ('santo-domingo-dominican-republic', 1, date '2026-07-15', date '2026-07-15', 1),
  ('seattle-usa', 1, date '2022-07-17', date '2022-07-18', 2),
  ('tijuana-mexico', 1, date '2026-04-04', date '2026-04-04', 1);

-- These two cities did not exist in the original 323-entry collection.
-- Their missing Google My Maps links are left NULL, not fabricated.
insert into public.cities (
  id, name, country, country_code, continent, region, subregion,
  longitude, latitude, map_status, visit_status, last_visited
) values
  ('austin-usa', 'Austin', 'USA', 'US', 'America', 'North America', '',
   -97.7431, 30.2672, 'Not Started', 'not-visited', null),
  ('san-antonio-usa', 'San Antonio', 'USA', 'US', 'America', 'North America', '',
   -98.4936, 29.4241, 'Not Started', 'not-visited', null)
on conflict (id) do nothing;

do $guard$
begin
  if exists (
    select 1 from approved_additional_cities a
    left join public.cities c on c.id = a.city_id
    where c.id is null or c.name is distinct from a.name
      or c.country_code is distinct from a.country_code
      or (c.last_visited is not null and c.last_visited <> a.last_visited::text)
  ) then
    raise exception 'Target city metadata or last-visit date differs from the approved additions; nothing changed.';
  end if;

  if exists (
    select 1 from public.city_visits existing
    join approved_additional_cities a on a.city_id = existing.city_id
    left join approved_additional_visits v
      on v.city_id = existing.city_id and v.visit_number = existing.visit_number
    where v.city_id is null or existing.arrival_date is distinct from v.arrival_date
      or existing.departure_date is distinct from v.departure_date
      or existing.days_spent is distinct from v.days_spent
  ) then
    raise exception 'An existing stay conflicts with the approved additional visit history; nothing changed.';
  end if;
end $guard$;

insert into public.city_visits (city_id,visit_number,arrival_date,departure_date,days_spent)
select city_id,visit_number,arrival_date,departure_date,days_spent
from approved_additional_visits
on conflict (city_id,visit_number) do nothing;

-- Update only visit status and latest date; preserve map status, links,
-- pin colors, notes, and all unrelated city/country records.
update public.cities c
set visit_status='visited', last_visited=a.last_visited::text
from approved_additional_cities a
where c.id=a.city_id
  and (c.visit_status,c.last_visited) is distinct from ('visited'::text,a.last_visited::text);

set constraints all immediate;
do $check$
begin
  if exists (
    select 1 from approved_additional_visits a
    left join public.city_visits v
      on v.city_id=a.city_id and v.visit_number=a.visit_number
    where v.city_id is null or v.arrival_date is distinct from a.arrival_date
      or v.departure_date is distinct from a.departure_date
      or v.days_spent is distinct from a.days_spent
  ) then
    raise exception 'Additional city visit verification failed; rolling back.';
  end if;
  if exists (
    select 1 from approved_additional_cities a
    join public.cities c on c.id=a.city_id
    where c.visit_status is distinct from 'visited' or
      c.last_visited is distinct from a.last_visited::text
  ) then
    raise exception 'Additional city summary verification failed; rolling back.';
  end if;
end $check$;
commit;
