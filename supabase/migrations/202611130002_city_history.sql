begin;

create table if not exists public.city_visits (
  city_id text not null references public.cities(id) on delete cascade,
  visit_number integer not null check (visit_number > 0),
  arrival_date date not null check (arrival_date between date '1000-01-01' and date '9999-12-31'),
  departure_date date not null check (departure_date between date '1000-01-01' and date '9999-12-31'),
  days_spent numeric not null check (
    days_spent > 0 and mod(days_spent, 0.5) = 0
    and departure_date >= arrival_date
    and days_spent <= departure_date - arrival_date + 1
  ),
  primary key (city_id, visit_number),
  unique (city_id, arrival_date)
);

-- Check the final transaction, so a set of stays can be imported or renumbered together.
-- Lock the parent city before checking to serialize concurrent history edits.
create or replace function atlas_private.validate_city_history()
returns trigger language plpgsql security definer set search_path = '' as $$
declare ids text[]; city text; total integer; last_number integer; latest date;
begin
  if tg_op = 'INSERT' then ids := array[new.city_id];
  elsif tg_op = 'DELETE' then ids := array[old.city_id];
  else ids := array[old.city_id, new.city_id]; end if;
  for city in select distinct unnest(ids) order by 1 loop
    perform 1 from public.cities where id = city for update;
    select count(*), max(visit_number), max(departure_date)
      into total, last_number, latest from public.city_visits where city_id = city;
    if total > 0 then
      if total <> last_number or exists (
        select 1 from public.city_visits a join public.city_visits b
          on a.city_id = b.city_id and a.visit_number < b.visit_number
        where a.city_id = city and a.departure_date >= b.arrival_date
      ) then raise exception 'Invalid city history: visits must be numbered chronologically without overlap.' using errcode = '23514'; end if;
      update public.cities set visit_status = 'visited', last_visited = latest::text
        where id = city and (visit_status, last_visited) is distinct from ('visited'::text, latest::text);
    else
      update public.cities set last_visited = null where id = city and last_visited is not null;
    end if;
  end loop;
  return null;
end $$;
revoke all on function atlas_private.validate_city_history() from public;
drop trigger if exists validate_city_history on public.city_visits;
create constraint trigger validate_city_history after insert or update or delete on public.city_visits
  deferrable initially deferred for each row execute function atlas_private.validate_city_history();

create or replace function atlas_private.check_city_visit_summary()
returns trigger language plpgsql security definer set search_path = '' as $$
declare latest date;
begin
  select max(departure_date) into latest from public.city_visits where city_id = new.id;
  if latest is not null and exists (
    select 1 from public.cities where id = new.id
      and (visit_status, last_visited) is distinct from ('visited'::text, latest::text)
  ) then raise exception 'City visit status and latest date must agree with its history.' using errcode = '23514'; end if;
  return null;
end $$;
revoke all on function atlas_private.check_city_visit_summary() from public;
drop trigger if exists check_city_visit_summary on public.cities;
create constraint trigger check_city_visit_summary after insert or update on public.cities
  deferrable initially deferred for each row execute function atlas_private.check_city_visit_summary();

alter table public.city_visits enable row level security;
revoke all on public.city_visits from anon, authenticated;
grant select on public.city_visits to anon, authenticated;
grant insert, update, delete on public.city_visits to authenticated;
drop policy if exists city_history_public_read on public.city_visits;
create policy city_history_public_read on public.city_visits for select to anon, authenticated using (true);
drop policy if exists city_history_owner_write on public.city_visits;
create policy city_history_owner_write on public.city_visits for all to authenticated
  using ((select public.atlas_can_edit())) with check ((select public.atlas_can_edit()));

-- One SQL statement keeps cities and their histories at the same database revision.
create or replace function public.atlas_city_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'cities', coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.cities c), '[]'::jsonb),
    'visits', coalesce((select jsonb_agg(to_jsonb(v) order by v.city_id, v.visit_number) from public.city_visits v), '[]'::jsonb)
  );
$$;
revoke all on function public.atlas_city_snapshot() from public;
grant execute on function public.atlas_city_snapshot() to anon, authenticated;

commit;
