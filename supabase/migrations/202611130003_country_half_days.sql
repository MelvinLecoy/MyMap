begin;

-- Numeric without a scale preserves exact halves and rejects rather than rounds quarters.
alter table public.countries alter column total_days_spent type numeric;
alter table public.country_visits alter column days_spent type numeric;
alter table public.country_visit_periods add column if not exists days_spent numeric;
alter table public.countries drop constraint if exists country_total_half_days;
alter table public.countries add constraint country_total_half_days check (total_days_spent is null or (total_days_spent >= 0 and mod(total_days_spent,0.5)=0));
alter table public.country_visits drop constraint if exists country_visit_half_days;
alter table public.country_visits add constraint country_visit_half_days check (days_spent is null or (days_spent > 0 and mod(days_spent,0.5)=0));
alter table public.country_visit_periods drop constraint if exists country_period_half_days;
alter table public.country_visit_periods add constraint country_period_half_days check (days_spent is null or (days_spent > 0 and mod(days_spent,0.5)=0 and days_spent <= departure_date-arrival_date+1));
grant update(days_spent) on public.country_visit_periods to authenticated;

create or replace function atlas_private.check_country_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare code_value text; c public.countries; visit_count integer; known_days numeric;
begin
  code_value := case when TG_TABLE_NAME='countries' then coalesce(to_jsonb(NEW)->>'code',to_jsonb(OLD)->>'code')
    else coalesce(to_jsonb(NEW)->>'country_code',to_jsonb(OLD)->>'country_code') end;
  select * into c from public.countries where code=code_value for update;
  if not found then return null; end if;
  select count(*) into visit_count from public.country_visits where country_code=code_value;
  if visit_count>0 and c.visit_status<>'visited' then raise exception 'Past visits require visited status.' using errcode='23514'; end if;
  if exists(select 1 from public.country_visits v where v.country_code=code_value and
    atlas_private.visit_date_bound(v.arrival_date,false)>atlas_private.visit_date_bound(v.departure_date,true))
    then raise exception 'Visit departure is before arrival.' using errcode='23514'; end if;
  if visit_count>0 and (select max(visit_number) from public.country_visits where country_code=code_value)<>visit_count
    then raise exception 'Visit numbers must be consecutive from 1.' using errcode='23514'; end if;
  if exists(select 1 from public.country_visits v join (
      select country_code,visit_number,min(arrival_date) as first_day,max(departure_date) as last_day,
        sum(coalesce(days_spent,departure_date-arrival_date+1)) as days,count(*) as n,max(period_number) as max_n
      from public.country_visit_periods where country_code=code_value group by country_code,visit_number
    ) p using(country_code,visit_number)
    where v.arrival_date is distinct from p.first_day::text or v.departure_date is distinct from p.last_day::text
      or (v.days_spent is not null and v.days_spent<>p.days) or p.n<>p.max_n)
    then raise exception 'Visit dates, days or period numbers disagree with actual stays.' using errcode='23514'; end if;
  if exists(select 1 from (
      select *,lag(departure_date) over w as previous_end,lag(visit_number) over w as previous_visit,
        lag(period_number) over w as previous_number
      from public.country_visit_periods where country_code=code_value
      window w as(order by arrival_date,departure_date)
    ) p where previous_end is not null and
      (arrival_date<=previous_end or ((visit_number=previous_visit)<>(arrival_date-previous_end<14))
       or (visit_number=previous_visit and period_number<>previous_number+1)
       or (visit_number<>previous_visit and visit_number<=previous_visit)))
    then raise exception 'Actual stays overlap, are out of order, or violate the 14-day visit rule.' using errcode='23514'; end if;
  select coalesce(sum(coalesce(v.days_spent,p.days,case when length(v.arrival_date)=10 and length(v.departure_date)=10 then v.departure_date::date-v.arrival_date::date+1 end)),0)
    into known_days from public.country_visits v left join (
      select country_code,visit_number,sum(coalesce(days_spent,departure_date-arrival_date+1)) as days from public.country_visit_periods group by country_code,visit_number
    ) p using(country_code,visit_number) where v.country_code=code_value;
  if (c.times_visited is not null and c.times_visited<visit_count) or (c.total_days_spent is not null and c.total_days_spent<known_days)
    then raise exception 'Lifetime totals are smaller than recorded history.' using errcode='23514'; end if;
  if c.visit_history_complete and ((c.times_visited is not null and c.times_visited<>visit_count) or (c.visit_status='visited' and visit_count=0))
    then raise exception 'Complete history disagrees with visit totals.' using errcode='23514'; end if;
  if c.visit_history_complete and c.total_days_spent is not null and
    not exists(select 1 from public.country_visits v where v.country_code=code_value and v.days_spent is null
      and not coalesce(length(v.arrival_date)=10 and length(v.departure_date)=10,false)
      and not exists(select 1 from public.country_visit_periods p where (p.country_code,p.visit_number)=(v.country_code,v.visit_number)))
    and c.total_days_spent<>known_days then raise exception 'Complete history disagrees with day totals.' using errcode='23514'; end if;
  return null;
end;
$$;
revoke all on function atlas_private.check_country_history() from public;

notify pgrst,'reload schema';
commit;
