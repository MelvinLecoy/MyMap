begin;

-- Convert legacy stay rows once. The original dates and explicit half-days move
-- intact into child periods; only counted visit numbers and their bounds change.
select pg_advisory_xact_lock(202611140001);
lock table public.cities in share row exclusive mode;
lock table public.city_visits in access exclusive mode;
create temporary table city_grouping_countries_before on commit drop as
  select public.atlas_country_snapshot() as data;
create temporary table city_grouping_metadata_before on commit drop as
  select to_jsonb(c) as data from public.cities c order by c.id;

do $convert$
begin
  if to_regclass('public.city_visit_periods') is null then
    drop trigger if exists validate_city_history on public.city_visits;
    create table public.city_visit_periods (
      city_id text not null,
      visit_number integer not null check (visit_number > 0),
      period_number integer not null check (period_number > 0),
      arrival_date date not null check (arrival_date between date '1000-01-01' and date '9999-12-31'),
      departure_date date not null check (departure_date between date '1000-01-01' and date '9999-12-31'),
      days_spent numeric not null check (
        days_spent > 0 and mod(days_spent, 0.5) = 0
        and departure_date >= arrival_date
        and days_spent <= departure_date - arrival_date + 1
      ),
      primary key (city_id, visit_number, period_number),
      unique (city_id, arrival_date),
      foreign key (city_id, visit_number) references public.city_visits(city_id, visit_number)
        on delete cascade deferrable initially deferred
    );
    create temporary table city_legacy_stays on commit drop as select * from public.city_visits;
    create temporary table city_grouped_stays on commit drop as
      select city_id, visit_number,
        row_number() over (partition by city_id, visit_number order by arrival_date)::integer as period_number,
        arrival_date, departure_date, days_spent
      from (
        select city_id, arrival_date, departure_date, days_spent,
          sum(starts_visit) over (partition by city_id order by arrival_date)::integer as visit_number
        from (
          select *, case when lag(departure_date) over (partition by city_id order by arrival_date) is null
            or arrival_date - lag(departure_date) over (partition by city_id order by arrival_date) >= 6
            then 1 else 0 end as starts_visit
          from city_legacy_stays
        ) marked
      ) grouped;
    delete from public.city_visits;
    insert into public.city_visits(city_id,visit_number,arrival_date,departure_date,days_spent)
      select city_id,visit_number,min(arrival_date),max(departure_date),sum(days_spent)
      from city_grouped_stays group by city_id,visit_number;
    insert into public.city_visit_periods(city_id,visit_number,period_number,arrival_date,departure_date,days_spent)
      select city_id,visit_number,period_number,arrival_date,departure_date,days_spent from city_grouped_stays;
    if exists (
      (select city_id,arrival_date,departure_date,days_spent from city_legacy_stays)
      except (select city_id,arrival_date,departure_date,days_spent from public.city_visit_periods)
    ) or exists (
      (select city_id,arrival_date,departure_date,days_spent from public.city_visit_periods)
      except (select city_id,arrival_date,departure_date,days_spent from city_legacy_stays)
    ) then raise exception 'City grouping changed an actual stay; rolling back.'; end if;
  end if;
end $convert$;

-- Flush the conversion's deferred foreign keys before changing table policies.
set constraints all immediate;
set constraints all deferred;

create or replace function atlas_private.validate_city_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ids text[]; city text; total integer; last_number integer; latest date;
begin
  if tg_op = 'INSERT' then ids := array[new.city_id];
  elsif tg_op = 'DELETE' then ids := array[old.city_id];
  else ids := array[old.city_id, new.city_id]; end if;
  for city in select distinct unnest(ids) order by 1 loop
    perform 1 from public.cities where id = city for update;
    if not found then continue; end if;
    select count(*),max(visit_number),max(departure_date) into total,last_number,latest
      from public.city_visits where city_id = city;
    if total > 0 then
      if total <> last_number or exists (
        select 1 from public.city_visits a join public.city_visits b
          on a.city_id=b.city_id and b.visit_number=a.visit_number+1
        where a.city_id=city and b.arrival_date-a.departure_date < 6
      ) then raise exception 'City visits must be numbered chronologically with at least six days between visits.' using errcode='23514'; end if;
      if exists (
        select 1 from public.city_visits v
        left join lateral (
          select count(*) as n,max(period_number) as last_number,min(arrival_date) as arrival,
            max(departure_date) as departure,sum(days_spent) as days
          from public.city_visit_periods p where p.city_id=v.city_id and p.visit_number=v.visit_number
        ) s on true
        where v.city_id=city and (s.n=0 or s.n<>s.last_number
          or (v.arrival_date,v.departure_date,v.days_spent) is distinct from (s.arrival,s.departure,s.days))
      ) then raise exception 'City visit bounds and duration must agree with numbered actual stay periods; gaps add no days.' using errcode='23514'; end if;
      if exists (
        select 1 from public.city_visit_periods a join public.city_visit_periods b
          on a.city_id=b.city_id and a.visit_number=b.visit_number and b.period_number=a.period_number+1
        where a.city_id=city and (b.arrival_date-a.departure_date <= 0 or b.arrival_date-a.departure_date >= 6)
      ) then raise exception 'City stay periods must be chronological without overlap and less than six days apart within a visit.' using errcode='23514'; end if;
      update public.cities set visit_status='visited',last_visited=latest::text
        where id=city and (visit_status,last_visited) is distinct from ('visited'::text,latest::text);
    else
      update public.cities set last_visited=null where id=city and last_visited is not null;
    end if;
  end loop;
  return null;
end $$;
revoke all on function atlas_private.validate_city_history() from public;
drop trigger if exists validate_city_history on public.city_visits;
create constraint trigger validate_city_history after insert or update or delete on public.city_visits
  deferrable initially deferred for each row execute function atlas_private.validate_city_history();
drop trigger if exists validate_city_periods on public.city_visit_periods;
create constraint trigger validate_city_periods after insert or update or delete on public.city_visit_periods
  deferrable initially deferred for each row execute function atlas_private.validate_city_history();

alter table public.city_visit_periods enable row level security;
revoke all on public.city_visit_periods from anon,authenticated;
grant select on public.city_visit_periods to anon,authenticated;
grant insert,update,delete on public.city_visit_periods to authenticated;
drop policy if exists city_periods_public_read on public.city_visit_periods;
create policy city_periods_public_read on public.city_visit_periods for select to anon,authenticated using(true);
drop policy if exists city_periods_owner_write on public.city_visit_periods;
create policy city_periods_owner_write on public.city_visit_periods for all to authenticated
  using((select public.atlas_can_edit())) with check((select public.atlas_can_edit()));

create or replace function public.atlas_city_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'cities',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.cities c),'[]'::jsonb),
    'visits',coalesce((select jsonb_agg(to_jsonb(v) order by v.city_id,v.visit_number) from public.city_visits v),'[]'::jsonb),
    'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.city_id,p.visit_number,p.period_number) from public.city_visit_periods p),'[]'::jsonb)
  );
$$;
revoke all on function public.atlas_city_snapshot() from public;
grant execute on function public.atlas_city_snapshot() to anon,authenticated;

set constraints all immediate;
do $preserved$ begin
  if exists((select data from city_grouping_metadata_before) except (select to_jsonb(c) from public.cities c))
    or exists((select to_jsonb(c) from public.cities c) except (select data from city_grouping_metadata_before))
    or (select data from city_grouping_countries_before) is distinct from public.atlas_country_snapshot()
    then raise exception 'City grouping changed city metadata or country history; rolling back.'; end if;
end $preserved$;
set constraints all deferred;
commit;
