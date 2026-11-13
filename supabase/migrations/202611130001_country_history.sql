begin;

create table if not exists public.countries (
  code text primary key check (code ~ '^[A-Z]{2}$'),
  name text not null check (length(name)>0),
  continent text not null check (length(continent)>0),
  is_195 boolean,
  visit_status text not null check (visit_status in ('visited','planned','not-visited','unknown')),
  first_visit_order integer unique check (first_visit_order>0),
  times_visited integer check (times_visited>=0),
  total_days_spent integer check (total_days_spent>=0),
  visit_history_complete boolean not null default false,
  notes text not null default '',
  aliases jsonb not null default '[]' check (jsonb_typeof(aliases)='array'),
  updated_at timestamptz not null default now(),
  check (first_visit_order is null or visit_status='visited'),
  check (code not in ('TW','XK') or is_195=false)
);
create table if not exists public.country_visits (
  country_code text not null references public.countries(code) on delete cascade,
  visit_number integer not null check (visit_number>0),
  arrival_date text check (atlas_private.valid_visit_date(arrival_date)),
  departure_date text check (atlas_private.valid_visit_date(departure_date)),
  days_spent integer check (days_spent>0),
  notes text not null default '',
  primary key (country_code,visit_number)
);
create table if not exists public.country_visit_periods (
  country_code text not null,
  visit_number integer not null,
  period_number integer not null check (period_number>0),
  arrival_date date not null check (arrival_date between date '0001-01-01' and date '9999-12-31'),
  departure_date date not null check (departure_date>=arrival_date and departure_date<=date '9999-12-31'),
  source_refs text not null default '',
  notes text not null default '',
  primary key (country_code,visit_number,period_number),
  foreign key (country_code,visit_number) references public.country_visits(country_code,visit_number) on delete cascade
);
create or replace function atlas_private.touch_country()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at:=clock_timestamp();return new;end;
$$;
revoke all on function atlas_private.touch_country() from public;
drop trigger if exists touch_country on public.countries;
create trigger touch_country before update on public.countries for each row execute function atlas_private.touch_country();

-- Partial dates remain text in the visit table; exact actual stays use date.
create or replace function atlas_private.visit_date_bound(value text, upper_bound boolean)
returns date language sql immutable set search_path='' as $$
  select case when value is null then null
    when length(value)=10 then value::date
    when length(value)=7 then case when upper_bound then ((value||'-01')::date+interval '1 month - 1 day')::date else (value||'-01')::date end
    else case when upper_bound then (value||'-12-31')::date else (value||'-01-01')::date end end;
$$;
revoke all on function atlas_private.visit_date_bound(text,boolean) from public;

-- Check the final transaction state, allowing a visit and its child periods to
-- be edited together. No overlapping days or contradictory cached durations.
create or replace function atlas_private.check_country_history()
returns trigger language plpgsql security definer set search_path='' as $$
declare code_value text; c public.countries; visit_count integer; known_days integer;
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
        sum(departure_date-arrival_date+1) as days,count(*) as n,max(period_number) as max_n
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
      select country_code,visit_number,sum(departure_date-arrival_date+1) as days from public.country_visit_periods group by country_code,visit_number
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

do $$ declare t text; begin
  foreach t in array array['countries','country_visits','country_visit_periods'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('grant select on public.%I to anon,authenticated',t);
    execute format('grant insert,delete on public.%I to authenticated',t);
    execute format('drop policy if exists country_public_read on public.%I',t);
    execute format('create policy country_public_read on public.%I for select to anon,authenticated using(true)',t);
    execute format('drop policy if exists country_owner_write on public.%I',t);
    execute format('create policy country_owner_write on public.%I for all to authenticated using((select public.atlas_can_edit())) with check((select public.atlas_can_edit()))',t);
    execute format('drop trigger if exists validate_country_history on public.%I',t);
    execute format('create constraint trigger validate_country_history after insert or update or delete on public.%I deferrable initially deferred for each row execute function atlas_private.check_country_history()',t);
  end loop;
end $$;
grant update(visit_status,first_visit_order,times_visited,total_days_spent,visit_history_complete,notes) on public.countries to authenticated;
grant update(arrival_date,departure_date,days_spent,notes) on public.country_visits to authenticated;
grant update(arrival_date,departure_date,source_refs,notes) on public.country_visit_periods to authenticated;

-- One statement gives readers a coherent snapshot of all three related tables.
create or replace function public.atlas_country_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'countries',coalesce((select jsonb_agg(to_jsonb(c) order by code) from public.countries c),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(to_jsonb(v) order by country_code,visit_number) from public.country_visits v),'[]'::jsonb),
    'periods',coalesce((select jsonb_agg(to_jsonb(p) order by country_code,visit_number,period_number) from public.country_visit_periods p),'[]'::jsonb)
  );
$$;
revoke all on function public.atlas_country_snapshot() from public;
grant execute on function public.atlas_country_snapshot() to anon,authenticated;
notify pgrst,'reload schema';

commit;
