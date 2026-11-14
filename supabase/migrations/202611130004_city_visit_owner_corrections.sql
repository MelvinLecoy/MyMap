-- Owner-approved changes to four historical city stays.
-- Idempotent: accept exactly the original rows or the intended final values.
-- Never overwrite unrelated city history edits or modify country data.
begin;
select pg_advisory_xact_lock(202611130004);

create temporary table approved_city_corrections (
  city_id text not null,
  visit_number integer not null,
  arrival_date date not null,
  old_departure date not null,
  old_days numeric not null,
  new_departure date not null,
  new_days numeric not null,
  primary key (city_id, visit_number)
) on commit drop;

insert into approved_city_corrections values
  ('los-angeles-usa', 1, date '2022-01-30', date '2022-02-01', 3, date '2022-02-02', 3.5),
  ('orlando-usa', 1, date '2022-03-01', date '2022-03-05', 5, date '2022-03-06', 5.5),
  ('boston-usa', 3, date '2022-06-26', date '2022-06-28', 3, date '2022-06-28', 2.5),
  ('san-francisco-usa', 2, date '2025-11-01', date '2025-11-01', 1, date '2025-11-02', 2);

do $guard$
begin
  if exists (
    select 1 from approved_city_corrections c
    left join public.city_visits v
      on v.city_id = c.city_id and v.visit_number = c.visit_number
    where v.city_id is null
      or v.arrival_date is distinct from c.arrival_date
      or not (
        (v.departure_date = c.old_departure and v.days_spent = c.old_days)
        or (v.departure_date = c.new_departure and v.days_spent = c.new_days)
      )
  ) then
    raise exception 'A city stay differs from the approved old/new values; no corrections applied.';
  end if;
end $guard$;

update public.city_visits v
set departure_date = c.new_departure, days_spent = c.new_days
from approved_city_corrections c
where v.city_id = c.city_id and v.visit_number = c.visit_number
  and v.arrival_date = c.arrival_date
  and v.departure_date = c.old_departure and v.days_spent = c.old_days;

-- Fire deferred city-history triggers, including last_visited synchronization.
set constraints all immediate;
do $check$
begin
  if exists (
    select 1 from approved_city_corrections c
    left join public.city_visits v
      on v.city_id = c.city_id and v.visit_number = c.visit_number
    where v.city_id is null or v.arrival_date is distinct from c.arrival_date
      or v.departure_date is distinct from c.new_departure
      or v.days_spent is distinct from c.new_days
  ) then
    raise exception 'Corrected city stay verification failed; rolling back.';
  end if;
  if exists (
    select 1 from (values
      ('los-angeles-usa', '2026-04-08'),
      ('orlando-usa', '2022-03-06'),
      ('boston-usa', '2022-06-28'),
      ('san-francisco-usa', '2025-11-02')
    ) as expected(city_id, last_visited)
    left join public.cities c on c.id = expected.city_id
    where c.id is null or c.last_visited is distinct from expected.last_visited
  ) then
    raise exception 'City last_visited verification failed; rolling back.';
  end if;
end $check$;

commit;
