begin;

-- The operator supplies the authoritative CSV reference as a transaction-local
-- table. There is no second maintained country taxonomy embedded in migration SQL.
create schema if not exists atlas_data;
revoke all on schema atlas_data from public;
grant usage on schema atlas_data to anon, authenticated;

create temporary table concise_function_definitions on commit drop as
select proname, pg_get_functiondef(oid) as definition
from pg_proc where pronamespace='atlas_private'::regnamespace
  and proname in ('validate_city_history','check_city_visit_summary','check_country_history');

-- Six unused projections added by the first compatibility stage are unnecessary
-- once the physical tables themselves carry the concise storage contract.
drop view if exists public.atlas_city_catalog, public.atlas_city_state,
  public.atlas_country_catalog, public.atlas_country_state,
  public.atlas_place_catalog, public.atlas_place_state;

do $move$ declare relation text; begin
  foreach relation in array array['cities','countries','city_visits','city_visit_periods',
    'country_visits','country_visit_periods','places','place_countries'] loop
    execute format('alter table public.%I disable trigger user', relation);
    execute format('alter table public.%I set schema atlas_data', relation);
  end loop;
end $move$;

do $references$ begin
  if not exists(select 1 from pg_constraint where conrelid='atlas_data.cities'::regclass and conname='cities_country_code_fkey') then
    alter table atlas_data.cities add constraint cities_country_code_fkey foreign key(country_code)
      references atlas_data.countries(code) deferrable initially deferred;
  end if;
end $references$;

alter table atlas_data.countries add column region text not null default '';
alter table atlas_data.countries add column subregion text not null default '';
alter table atlas_data.countries add column city_label text;
update atlas_data.countries c set region=r.region,subregion=r.subregion,
  city_label=nullif(r.city_label,c.name)
from concise_country_reference r where r.code=c.code;

-- A region-only reference refresh changes city projections, not the legacy
-- country's own visible fields. Preserve that row's existing revision behavior.
create or replace function atlas_private.touch_country()
returns trigger language plpgsql set search_path='' as $$
begin
  if (NEW.region,NEW.subregion,NEW.city_label) is distinct from (OLD.region,OLD.subregion,OLD.city_label)
    and (to_jsonb(NEW)-array['region','subregion','city_label'])=(to_jsonb(OLD)-array['region','subregion','city_label'])
  then NEW.updated_at:=OLD.updated_at;
  else NEW.updated_at:=clock_timestamp(); end if;
  return NEW;
end; $$;

create or replace function atlas_private.map_viewer_url(map_url text)
returns text language sql immutable set search_path='' as $$
  select case when map_url is null then null else
    'https://www.google.com/maps/d/viewer?mid=' || substring(map_url from '[?&]mid=([A-Za-z0-9_-]+)') end;
$$;
revoke all on function atlas_private.map_viewer_url(text) from public;
grant execute on function atlas_private.map_viewer_url(text) to anon,authenticated;

do $maps$ begin
  if exists(select 1 from atlas_data.cities where map_viewer_url is distinct from atlas_private.map_viewer_url(map_embed_url))
    or exists(select 1 from atlas_data.places where map_viewer_url is distinct from atlas_private.map_viewer_url(map_embed_url))
  then raise exception 'A viewer URL contains independent information; refusing to remove it.'; end if;
end $maps$;

alter table atlas_data.cities add column country_label_override text;
alter table atlas_data.cities add column unclassified_geography jsonb;
update atlas_data.cities c set
  country_label_override=case when p.code is null or c.country is distinct from coalesce(p.city_label,p.name) then c.country end,
  unclassified_geography=case when p.code is null then jsonb_build_object('continent',c.continent,'region',c.region,'subregion',c.subregion) end
from (select x.id,p.* from atlas_data.cities x left join atlas_data.countries p on p.code=x.country_code) p
where p.id=c.id;

do $geography$ begin
  if exists(select 1 from atlas_data.cities c join atlas_data.countries p on p.code=c.country_code
    where (c.continent,c.region,c.subregion) is distinct from (p.continent,p.region,p.subregion))
  then raise exception 'City geography is not derivable from its country; refusing to discard it.'; end if;
end $geography$;

-- Flush deferred FK events before changing the row layout. History triggers
-- remain disabled until their equivalent read projections have been installed.
set constraints all immediate;

-- LastVisited is calculated from stays when history exists. Only standalone,
-- partial or unknown-history dates have an independent override.
alter table atlas_data.cities rename column last_visited to last_visit_override;
update atlas_data.cities c set last_visit_override=null
where exists(select 1 from atlas_data.city_visit_periods p where p.city_id=c.id);
alter table atlas_data.cities drop column country, drop column continent,
  drop column region, drop column subregion, drop column map_viewer_url;
alter table atlas_data.cities rename column map_embed_url to map_url;
alter table atlas_data.cities add constraint valid_canonical_map check (
  map_url is null or (map_url ~ '^https://(www\.)?google\.com/maps/d/'
    and atlas_private.map_viewer_url(map_url) is not null));

-- Visit identities and their foreign keys remain; copied date/day aggregates do not.
alter table atlas_data.city_visits drop column arrival_date,
  drop column departure_date, drop column days_spent;
alter table atlas_data.city_visit_periods rename column days_spent to days_override;
alter table atlas_data.city_visit_periods alter column days_override drop not null;
update atlas_data.city_visit_periods set days_override=null
where days_override=departure_date-arrival_date+1;

-- Countries retain independent manual/partial visit values only when no actual
-- periods supply them. The US undated visit remains a real record with nulls.
alter table atlas_data.country_visits rename column arrival_date to arrival_override;
alter table atlas_data.country_visits rename column departure_date to departure_override;
alter table atlas_data.country_visits rename column days_spent to days_override;
update atlas_data.country_visits v set arrival_override=null,departure_override=null,days_override=null
where exists(select 1 from atlas_data.country_visit_periods p
  where (p.country_code,p.visit_number)=(v.country_code,v.visit_number));

alter table atlas_data.places drop column map_viewer_url;
alter table atlas_data.places rename column map_embed_url to map_url;
alter table atlas_data.places add constraint valid_canonical_map check (
  map_url is null or (map_url ~ '^https://(www\.)?google\.com/maps/d/'
    and atlas_private.map_viewer_url(map_url) is not null));

-- These views are API adapters, not duplicate stored rows. Their columns and
-- JSON output reproduce the original public tables exactly for existing clients.
create view public.countries with (security_invoker=true) as
select code,name,continent,is_195,visit_status,first_visit_order,times_visited,
  total_days_spent,visit_history_complete,notes,aliases,updated_at
from atlas_data.countries;

create view public.city_visit_periods with (security_invoker=true) as
select city_id,visit_number,period_number,arrival_date,departure_date,
  coalesce(days_override,departure_date-arrival_date+1)::numeric as days_spent
from atlas_data.city_visit_periods;

create view public.city_visits with (security_invoker=true) as
select v.city_id,v.visit_number,p.arrival_date,p.departure_date,p.days_spent
from atlas_data.city_visits v left join lateral (
  select min(s.arrival_date) as arrival_date,max(s.departure_date) as departure_date,
    sum(coalesce(s.days_override,s.departure_date-s.arrival_date+1)) as days_spent
  from atlas_data.city_visit_periods s where (s.city_id,s.visit_number)=(v.city_id,v.visit_number)
) p on true;

create view public.cities with (security_invoker=true) as
select c.id,c.name,coalesce(c.country_label_override,p.city_label,p.name,'') as country,
  c.country_code,
  coalesce(c.unclassified_geography->>'continent',p.continent,'') as continent,
  coalesce(c.unclassified_geography->>'region',p.region,'') as region,
  coalesce(c.unclassified_geography->>'subregion',p.subregion,'') as subregion,
  c.longitude,c.latitude,c.map_url as map_embed_url,
  atlas_private.map_viewer_url(c.map_url) as map_viewer_url,c.map_status,c.visit_status,
  coalesce((select max(s.departure_date)::text from atlas_data.city_visit_periods s where s.city_id=c.id),c.last_visit_override) as last_visited,
  c.notes,c.pin_color,c.created_at,c.updated_at
from atlas_data.cities c left join atlas_data.countries p on p.code=c.country_code;

create view public.country_visit_periods with (security_invoker=true) as
select country_code,visit_number,period_number,arrival_date,departure_date,
  source_refs,notes,days_spent from atlas_data.country_visit_periods;

create view public.country_visits with (security_invoker=true) as
select v.country_code,v.visit_number,
  coalesce(v.arrival_override,p.arrival_date::text) as arrival_date,
  coalesce(v.departure_override,p.departure_date::text) as departure_date,
  coalesce(v.days_override,p.days_spent) as days_spent,v.notes
from atlas_data.country_visits v left join lateral (
  select min(s.arrival_date) as arrival_date,max(s.departure_date) as departure_date,
    sum(coalesce(s.days_spent,s.departure_date-s.arrival_date+1)) as days_spent
  from atlas_data.country_visit_periods s where (s.country_code,s.visit_number)=(v.country_code,v.visit_number)
) p on true;

create view public.places with (security_invoker=true) as
select id,name,continent,region,subregion,longitude,latitude,map_url as map_embed_url,
  atlas_private.map_viewer_url(map_url) as map_viewer_url,map_status,visit_status,
  last_visited,notes,pin_color,outline,outline_source,created_at,updated_at
from atlas_data.places;
create view public.place_countries with (security_invoker=true) as
select place_id,country_code,position from atlas_data.place_countries;

-- Legacy writable aggregate columns are checked against final child records in
-- transaction-local memory, never persisted as a second source of truth.
create or replace function atlas_private.remember_summary(summary_kind text,summary_identity text,summary_wanted jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
  if to_regclass('pg_temp.atlas_summary_intents') is not null and exists(
    select 1 from pg_class where oid=to_regclass('pg_temp.atlas_summary_intents')
      and relowner<>(select oid from pg_roles where rolname=current_user))
  then raise exception 'Untrusted summary validation table.' using errcode='42501'; end if;
  create temporary table if not exists atlas_summary_intents (
    kind text,identity text,wanted jsonb,primary key(kind,identity)
  ) on commit drop;
  insert into pg_temp.atlas_summary_intents values(summary_kind,summary_identity,summary_wanted)
    on conflict(kind,identity) do update set wanted=excluded.wanted;
end; $$;
revoke all on function atlas_private.remember_summary(text,text,jsonb) from public;

create or replace function atlas_private.check_summary_intents()
returns trigger language plpgsql security definer set search_path='' as $$
declare intent record; actual jsonb; begin
  if to_regclass('pg_temp.atlas_summary_intents') is null then return null; end if;
  for intent in select * from pg_temp.atlas_summary_intents loop
    actual:=null;
    if intent.kind='city_visit' then
      select jsonb_build_object('arrival_date',v.arrival_date,'departure_date',v.departure_date,'days_spent',v.days_spent)
        into actual from public.city_visits v where v.city_id||':'||v.visit_number=intent.identity;
    elsif intent.kind='city_date' then
      select jsonb_build_object('last_visited',c.last_visited) into actual from public.cities c where c.id=intent.identity;
    end if;
    if actual is not null and actual is distinct from intent.wanted then
      raise exception 'Supplied summary differs from actual stay records.' using errcode='23514';
    end if;
  end loop;
  return null;
end; $$;
revoke all on function atlas_private.check_summary_intents() from public;

create or replace function atlas_private.write_collection_view()
returns trigger language plpgsql security definer set search_path='' as $$
declare country_row atlas_data.countries; result jsonb; caller text; begin
  caller:=coalesce(nullif(current_setting('role',true),'none'),session_user);
  if caller<>current_user and not exists(select 1 from pg_roles where rolname=caller and (rolsuper or rolbypassrls))
    and not coalesce(public.atlas_can_edit(),false)
    then raise exception 'Only the atlas editor can change collection data.' using errcode='42501'; end if;
  if TG_TABLE_NAME='cities' then
    if TG_OP='DELETE' then delete from atlas_data.cities where id=OLD.id; return OLD; end if;
    if NEW.country_code is not null then
      select * into country_row from atlas_data.countries where code=NEW.country_code;
      if TG_OP='INSERT' and NEW.continent is null and NEW.region is null and NEW.subregion is null then
        NEW.continent:=country_row.continent;NEW.region:=country_row.region;NEW.subregion:=country_row.subregion;
      end if;
      if found and (NEW.continent,NEW.region,NEW.subregion) is distinct from
        (country_row.continent,country_row.region,country_row.subregion) then
        raise exception 'City classification is owned by its country reference.' using errcode='23514';
      end if;
    end if;
    if NEW.map_viewer_url is distinct from atlas_private.map_viewer_url(NEW.map_embed_url)
      then raise exception 'Map viewer must match the canonical map URL.' using errcode='23514'; end if;
    if TG_OP='INSERT' then
      insert into atlas_data.cities(id,name,country_code,country_label_override,unclassified_geography,
        longitude,latitude,map_url,map_status,visit_status,last_visit_override,notes,pin_color,created_at,updated_at)
      values(NEW.id,NEW.name,NEW.country_code,
        nullif(NEW.country,coalesce(country_row.city_label,country_row.name)),
        case when NEW.country_code is null then jsonb_build_object('continent',coalesce(NEW.continent,''),'region',coalesce(NEW.region,''),'subregion',coalesce(NEW.subregion,'')) end,
        NEW.longitude,NEW.latitude,NEW.map_embed_url,NEW.map_status,coalesce(NEW.visit_status,'not-visited'),
        NEW.last_visited,coalesce(NEW.notes,''),NEW.pin_color,coalesce(NEW.created_at,now()),coalesce(NEW.updated_at,now()));
    else
      if NEW.last_visited is distinct from OLD.last_visited then
        perform atlas_private.remember_summary('city_date',OLD.id,jsonb_build_object('last_visited',NEW.last_visited));
      end if;
      update atlas_data.cities set id=NEW.id,name=NEW.name,country_code=NEW.country_code,
        country_label_override=nullif(NEW.country,coalesce(country_row.city_label,country_row.name)),
        unclassified_geography=case when NEW.country_code is null then jsonb_build_object('continent',NEW.continent,'region',NEW.region,'subregion',NEW.subregion) end,
        longitude=NEW.longitude,latitude=NEW.latitude,map_url=NEW.map_embed_url,map_status=NEW.map_status,
        visit_status=NEW.visit_status,last_visit_override=case when exists(select 1 from atlas_data.city_visit_periods where city_id=OLD.id) then null else NEW.last_visited end,
        notes=NEW.notes,pin_color=NEW.pin_color where id=OLD.id;
    end if;
    select to_jsonb(c) into result from public.cities c where id=NEW.id;
  elsif TG_TABLE_NAME='city_visits' then
    if TG_OP='DELETE' then delete from atlas_data.city_visits where (city_id,visit_number)=(OLD.city_id,OLD.visit_number); return OLD; end if;
    if NEW.arrival_date is null or NEW.departure_date is null or NEW.days_spent is null then
      raise exception 'Legacy visit writes require dates and days.' using errcode='23502'; end if;
    perform atlas_private.remember_summary('city_visit',NEW.city_id||':'||NEW.visit_number,
      jsonb_build_object('arrival_date',NEW.arrival_date,'departure_date',NEW.departure_date,'days_spent',NEW.days_spent));
    if TG_OP='INSERT' then insert into atlas_data.city_visits values(NEW.city_id,NEW.visit_number);
    else update atlas_data.city_visits set city_id=NEW.city_id,visit_number=NEW.visit_number
      where (city_id,visit_number)=(OLD.city_id,OLD.visit_number); end if;
    return NEW;
  elsif TG_TABLE_NAME='city_visit_periods' then
    if TG_OP='DELETE' then delete from atlas_data.city_visit_periods
      where (city_id,visit_number,period_number)=(OLD.city_id,OLD.visit_number,OLD.period_number); return OLD; end if;
    if NEW.days_spent is null then raise exception 'Actual stay duration is required.' using errcode='23502'; end if;
    if TG_OP='INSERT' then
      insert into atlas_data.city_visit_periods(city_id,visit_number,period_number,arrival_date,departure_date,days_override)
      values(NEW.city_id,NEW.visit_number,NEW.period_number,NEW.arrival_date,NEW.departure_date,
        nullif(NEW.days_spent,NEW.departure_date-NEW.arrival_date+1));
    else update atlas_data.city_visit_periods set city_id=NEW.city_id,visit_number=NEW.visit_number,
      period_number=NEW.period_number,arrival_date=NEW.arrival_date,departure_date=NEW.departure_date,
      days_override=nullif(NEW.days_spent,NEW.departure_date-NEW.arrival_date+1)
      where (city_id,visit_number,period_number)=(OLD.city_id,OLD.visit_number,OLD.period_number); end if;
    return NEW;
  elsif TG_TABLE_NAME='countries' then
    if TG_OP='DELETE' then delete from atlas_data.countries where code=OLD.code; return OLD; end if;
    if TG_OP='INSERT' then
      insert into atlas_data.countries(code,name,continent,is_195,visit_status,first_visit_order,times_visited,
        total_days_spent,visit_history_complete,notes,aliases,updated_at)
      values(NEW.code,NEW.name,NEW.continent,NEW.is_195,NEW.visit_status,NEW.first_visit_order,NEW.times_visited,
        NEW.total_days_spent,coalesce(NEW.visit_history_complete,false),coalesce(NEW.notes,''),coalesce(NEW.aliases,'[]'::jsonb),coalesce(NEW.updated_at,now()));
    else update atlas_data.countries set code=NEW.code,name=NEW.name,continent=NEW.continent,is_195=NEW.is_195,
      visit_status=NEW.visit_status,first_visit_order=NEW.first_visit_order,times_visited=NEW.times_visited,
      total_days_spent=NEW.total_days_spent,visit_history_complete=NEW.visit_history_complete,notes=NEW.notes,aliases=NEW.aliases
      where code=OLD.code; end if;
    select to_jsonb(c) into result from public.countries c where code=NEW.code;
  elsif TG_TABLE_NAME='country_visits' then
    if TG_OP='DELETE' then delete from atlas_data.country_visits where (country_code,visit_number)=(OLD.country_code,OLD.visit_number); return OLD; end if;
    if TG_OP='INSERT' then insert into atlas_data.country_visits(country_code,visit_number,arrival_override,departure_override,days_override,notes)
      values(NEW.country_code,NEW.visit_number,NEW.arrival_date,NEW.departure_date,NEW.days_spent,coalesce(NEW.notes,''));
    else update atlas_data.country_visits set country_code=NEW.country_code,visit_number=NEW.visit_number,
      arrival_override=NEW.arrival_date,departure_override=NEW.departure_date,days_override=NEW.days_spent,notes=NEW.notes
      where (country_code,visit_number)=(OLD.country_code,OLD.visit_number); end if;
    return NEW;
  elsif TG_TABLE_NAME='country_visit_periods' then
    if TG_OP='DELETE' then delete from atlas_data.country_visit_periods
      where (country_code,visit_number,period_number)=(OLD.country_code,OLD.visit_number,OLD.period_number); return OLD; end if;
    if TG_OP='INSERT' then insert into atlas_data.country_visit_periods(country_code,visit_number,period_number,arrival_date,departure_date,source_refs,notes,days_spent)
      values(NEW.country_code,NEW.visit_number,NEW.period_number,NEW.arrival_date,NEW.departure_date,coalesce(NEW.source_refs,''),coalesce(NEW.notes,''),NEW.days_spent);
    else update atlas_data.country_visit_periods set country_code=NEW.country_code,visit_number=NEW.visit_number,
      period_number=NEW.period_number,arrival_date=NEW.arrival_date,departure_date=NEW.departure_date,
      source_refs=NEW.source_refs,notes=NEW.notes,days_spent=NEW.days_spent
      where (country_code,visit_number,period_number)=(OLD.country_code,OLD.visit_number,OLD.period_number); end if;
    return NEW;
  elsif TG_TABLE_NAME='places' then
    if TG_OP='DELETE' then delete from atlas_data.places where id=OLD.id; return OLD; end if;
    if NEW.map_viewer_url is distinct from atlas_private.map_viewer_url(NEW.map_embed_url)
      then raise exception 'Map viewer must match the canonical map URL.' using errcode='23514'; end if;
    if TG_OP='INSERT' then insert into atlas_data.places(id,name,continent,region,subregion,longitude,latitude,map_url,
      map_status,visit_status,last_visited,notes,pin_color,outline,outline_source,created_at,updated_at)
      values(NEW.id,NEW.name,coalesce(NEW.continent,''),coalesce(NEW.region,''),coalesce(NEW.subregion,''),NEW.longitude,NEW.latitude,NEW.map_embed_url,
        NEW.map_status,coalesce(NEW.visit_status,'unknown'),NEW.last_visited,coalesce(NEW.notes,''),NEW.pin_color,NEW.outline,coalesce(NEW.outline_source,''),coalesce(NEW.created_at,now()),coalesce(NEW.updated_at,now()));
    else update atlas_data.places set id=NEW.id,name=NEW.name,continent=NEW.continent,region=NEW.region,subregion=NEW.subregion,
      longitude=NEW.longitude,latitude=NEW.latitude,map_url=NEW.map_embed_url,map_status=NEW.map_status,visit_status=NEW.visit_status,
      last_visited=NEW.last_visited,notes=NEW.notes,pin_color=NEW.pin_color,outline=NEW.outline,outline_source=NEW.outline_source where id=OLD.id; end if;
    select to_jsonb(p) into result from public.places p where id=NEW.id;
  elsif TG_TABLE_NAME='place_countries' then
    if TG_OP='DELETE' then delete from atlas_data.place_countries where (place_id,country_code)=(OLD.place_id,OLD.country_code); return OLD; end if;
    if TG_OP='INSERT' then insert into atlas_data.place_countries values(NEW.place_id,NEW.country_code,NEW.position);
    else update atlas_data.place_countries set place_id=NEW.place_id,country_code=NEW.country_code,position=NEW.position
      where (place_id,country_code)=(OLD.place_id,OLD.country_code); end if;
    return NEW;
  end if;
  return jsonb_populate_record(NEW,result);
end; $$;
revoke all on function atlas_private.write_collection_view() from public;

do $access$ declare relation text; begin
  foreach relation in array array['cities','countries','city_visits','city_visit_periods',
    'country_visits','country_visit_periods','places','place_countries'] loop
    execute format('create trigger write_collection instead of insert or update or delete on public.%I for each row execute function atlas_private.write_collection_view()',relation);
    execute format('revoke all on public.%I from public,anon,authenticated',relation);
    execute format('grant select on public.%I to anon,authenticated',relation);
    execute format('revoke all on atlas_data.%I from public,anon,authenticated',relation);
    execute format('grant select on atlas_data.%I to anon,authenticated',relation);
    execute format('alter table atlas_data.%I enable trigger user',relation);
  end loop;
end $access$;
grant update(map_status,visit_status,last_visited,notes,pin_color) on public.cities to authenticated;
grant update(map_status) on public.places to authenticated;
grant insert,delete on public.countries,public.country_visits,public.country_visit_periods,
  public.city_visits,public.city_visit_periods to authenticated;
grant update(visit_status,first_visit_order,times_visited,total_days_spent,visit_history_complete,notes) on public.countries to authenticated;
grant update(arrival_date,departure_date,days_spent,notes) on public.country_visits to authenticated;
grant update(arrival_date,departure_date,days_spent) on public.city_visits,public.city_visit_periods to authenticated;
grant update(arrival_date,departure_date,source_refs,notes,days_spent) on public.country_visit_periods to authenticated;

-- Restore the existing history validators against API projections. Lock the
-- physical city identity rather than attempting to lock its derived join.
do $functions$ declare f record; definition text; begin
  for f in select * from concise_function_definitions loop
    definition:=f.definition;
    if f.proname='validate_city_history' then
      definition:=regexp_replace(definition,'perform 1 from public[.]cities where id[ ]*=[ ]*city for update;',
        'perform 1 from atlas_data.cities where id=city for update;');
    end if;
    execute definition;
  end loop;
end $functions$;

create or replace function atlas_private.normalize_country_overrides()
returns trigger language plpgsql security definer set search_path='' as $$
declare code_value text; begin
  code_value:=case when TG_TABLE_NAME='countries' then coalesce(to_jsonb(NEW)->>'code',to_jsonb(OLD)->>'code')
    else coalesce(to_jsonb(NEW)->>'country_code',to_jsonb(OLD)->>'country_code') end;
  update atlas_data.country_visits v set arrival_override=null,departure_override=null,days_override=null
    where v.country_code=code_value and (v.arrival_override is not null or v.departure_override is not null or v.days_override is not null)
    and exists(select 1 from atlas_data.country_visit_periods p where (p.country_code,p.visit_number)=(v.country_code,v.visit_number));
  return null;
end; $$;
revoke all on function atlas_private.normalize_country_overrides() from public;
create or replace function atlas_private.normalize_city_dates()
returns trigger language plpgsql security definer set search_path='' as $$
declare city_value text; begin
  city_value:=case when TG_TABLE_NAME='cities' then coalesce(to_jsonb(NEW)->>'id',to_jsonb(OLD)->>'id')
    else coalesce(to_jsonb(NEW)->>'city_id',to_jsonb(OLD)->>'city_id') end;
  update atlas_data.cities c set last_visit_override=null where c.id=city_value
    and c.last_visit_override is not null and exists(select 1 from atlas_data.city_visit_periods p where p.city_id=c.id);
  return null;
end; $$;
revoke all on function atlas_private.normalize_city_dates() from public;
do $checks$ declare relation text; begin
  foreach relation in array array['countries','country_visits','country_visit_periods'] loop
    execute format('create constraint trigger zz_normalize_overrides after insert or update or delete on atlas_data.%I deferrable initially deferred for each row execute function atlas_private.normalize_country_overrides()',relation);
  end loop;
  foreach relation in array array['cities','city_visits','city_visit_periods'] loop
    execute format('create constraint trigger concise_summary_intents after insert or update or delete on atlas_data.%I deferrable initially deferred for each row execute function atlas_private.check_summary_intents()',relation);
    execute format('create constraint trigger zz_normalize_city_dates after insert or update or delete on atlas_data.%I deferrable initially deferred for each row execute function atlas_private.normalize_city_dates()',relation);
  end loop;
end $checks$;

-- Rebind readers and the import return type to the public compatibility views.
create or replace function public.atlas_city_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'cities',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.cities c),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(to_jsonb(v) order by v.city_id,v.visit_number) from public.city_visits v),'[]'::jsonb),
 'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.city_id,p.visit_number,p.period_number) from public.city_visit_periods p),'[]'::jsonb));
$$;
create or replace function public.atlas_country_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
 'countries',coalesce((select jsonb_agg(to_jsonb(c) order by c.code) from public.countries c),'[]'::jsonb),
 'visits',coalesce((select jsonb_agg(to_jsonb(v) order by v.country_code,v.visit_number) from public.country_visits v),'[]'::jsonb),
 'periods',coalesce((select jsonb_agg(to_jsonb(p) order by p.country_code,p.visit_number,p.period_number) from public.country_visit_periods p),'[]'::jsonb));
$$;
create or replace function public.atlas_places_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(p)||jsonb_build_object('countries',coalesce((select jsonb_agg(jsonb_build_object('code',c.code,'name',c.name) order by pc.position)
 from public.place_countries pc join public.countries c on c.code=pc.country_code where pc.place_id=p.id),'[]'::jsonb)) order by p.name,p.id),'[]'::jsonb) from public.places p;
$$;

drop function public.atlas_import_statuses(jsonb);
create function public.atlas_import_statuses(changes jsonb)
returns setof public.cities language plpgsql security invoker set search_path='' as $$
declare item jsonb; changed public.cities; seen text[]:='{}'; begin
 if not public.atlas_can_edit() then raise exception 'Only the atlas editor can import statuses.' using errcode='42501'; end if;
 if jsonb_typeof(changes)<>'array' or jsonb_array_length(changes)>1000 then raise exception 'Invalid status import.' using errcode='22023'; end if;
 for item in select * from jsonb_array_elements(changes) loop
  if item->>'id' is null or item->>'id'=any(seen) or item->>'status' is null or item->>'updated_at' is null then raise exception 'Invalid or duplicate city in import.' using errcode='22023'; end if;
  seen:=array_append(seen,item->>'id');
  update public.cities set map_status=item->>'status' where id=item->>'id' and updated_at=(item->>'updated_at')::timestamptz returning * into changed;
  if not found then raise exception 'A city changed since the import was reviewed. Refresh and review again.' using errcode='40001'; end if;
  return next changed;
 end loop;
end; $$;
revoke all on function public.atlas_import_statuses(jsonb) from public,anon;
grant execute on function public.atlas_import_statuses(jsonb) to authenticated;
create or replace function public.atlas_collection_snapshot()
returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('version',1,'cities',public.atlas_city_snapshot(),
  'countries',public.atlas_country_snapshot(),'places',public.atlas_places_snapshot());
$$;
revoke all on function public.atlas_collection_snapshot() from public;
grant execute on function public.atlas_collection_snapshot() to anon,authenticated;
notify pgrst,'reload schema';

commit;
