begin;
select pg_advisory_xact_lock(202611140001);

-- Owner correction: 22-23 July 2025 counts as 1.5 days.
-- Permit fresh seeds and exact reapplication, and reject an unreviewed stay.
do $guard$ begin
  if not exists(select 1 from public.city_visits where city_id='ho-chi-minh-city-vietnam' and visit_number=1)
    and not exists(select 1 from public.city_visit_periods where city_id='ho-chi-minh-city-vietnam' and visit_number=1)
    then return; end if;
  if not exists(select 1 from public.city_visits where city_id='ho-chi-minh-city-vietnam' and visit_number=1
      and arrival_date=date '2025-07-22'
      and ((departure_date=date '2025-07-22' and days_spent=1) or (departure_date=date '2025-07-23' and days_spent=1.5)))
    or (select count(*) from public.city_visit_periods where city_id='ho-chi-minh-city-vietnam' and visit_number=1)<>1
    or not exists(select 1 from public.city_visit_periods where city_id='ho-chi-minh-city-vietnam' and visit_number=1 and period_number=1
      and arrival_date=date '2025-07-22'
      and ((departure_date=date '2025-07-22' and days_spent=1) or (departure_date=date '2025-07-23' and days_spent=1.5)))
    then raise exception 'Ho Chi Minh City differs from the approved before/after stay; nothing changed.'; end if;
end $guard$;

update public.city_visits set departure_date=date '2025-07-23',days_spent=1.5
  where city_id='ho-chi-minh-city-vietnam' and visit_number=1 and arrival_date=date '2025-07-22'
    and departure_date=date '2025-07-22' and days_spent=1;
update public.city_visit_periods set departure_date=date '2025-07-23',days_spent=1.5
  where city_id='ho-chi-minh-city-vietnam' and visit_number=1 and period_number=1 and arrival_date=date '2025-07-22'
    and departure_date=date '2025-07-22' and days_spent=1;

set constraints all immediate;
set constraints all deferred;
commit;
