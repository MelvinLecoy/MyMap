begin;
select pg_advisory_xact_lock(202611140001);

-- Owner correction: 17-21 July 2025 is 4.5 days. Accept the exact published
-- before/after values, preserve all other history, and allow a fresh empty seed.
create temporary table seoul_correction_before on commit drop as
  select to_jsonb(c)-array['last_visited','updated_at'] as city
  from public.cities c where id='seoul-south-korea';
create temporary table seoul_country_before on commit drop as
  select public.atlas_country_snapshot() as data;

do $guard$ begin
  if not exists(select 1 from public.city_visits where city_id='seoul-south-korea' and visit_number=1)
    and not exists(select 1 from public.city_visit_periods where city_id='seoul-south-korea' and visit_number=1)
    then return; end if;
  if not exists(select 1 from public.city_visits where city_id='seoul-south-korea' and visit_number=1
      and arrival_date=date '2025-07-17'
      and ((departure_date=date '2025-07-20' and days_spent=3.5) or (departure_date=date '2025-07-21' and days_spent=4.5)))
    or (select count(*) from public.city_visit_periods where city_id='seoul-south-korea' and visit_number=1)<>1
    or not exists(select 1 from public.city_visit_periods where city_id='seoul-south-korea' and visit_number=1 and period_number=1
      and arrival_date=date '2025-07-17'
      and ((departure_date=date '2025-07-20' and days_spent=3.5) or (departure_date=date '2025-07-21' and days_spent=4.5)))
    then raise exception 'Seoul history differs from the approved old/new values; nothing changed.'; end if;
end $guard$;

update public.city_visits set departure_date=date '2025-07-21',days_spent=4.5
  where city_id='seoul-south-korea' and visit_number=1 and arrival_date=date '2025-07-17'
  and departure_date=date '2025-07-20' and days_spent=3.5;
update public.city_visit_periods set departure_date=date '2025-07-21',days_spent=4.5
  where city_id='seoul-south-korea' and visit_number=1 and period_number=1 and arrival_date=date '2025-07-17'
  and departure_date=date '2025-07-20' and days_spent=3.5;

set constraints all immediate;
do $check$ begin
  if exists(select 1 from public.city_visits where city_id='seoul-south-korea' and visit_number=1
      and (arrival_date,departure_date,days_spent) is distinct from (date '2025-07-17',date '2025-07-21',4.5::numeric))
    or exists(select 1 from public.city_visit_periods where city_id='seoul-south-korea' and visit_number=1
      and (period_number,arrival_date,departure_date,days_spent) is distinct from (1,date '2025-07-17',date '2025-07-21',4.5::numeric))
    or (select data from seoul_country_before) is distinct from public.atlas_country_snapshot()
    or exists(select 1 from seoul_correction_before b
      where b.city is distinct from (select to_jsonb(c)-array['last_visited','updated_at'] from public.cities c where id='seoul-south-korea'))
    then raise exception 'Seoul correction verification failed; rolling back.'; end if;
end $check$;
set constraints all deferred;
commit;
