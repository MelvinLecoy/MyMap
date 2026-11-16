begin;

-- A verified location and map can be published before a regional boundary is
-- available. NULL means unavailable; existing geometry and permissions remain.
do $migration$
begin
  if to_regclass('atlas_data.places') is not null then
    alter table atlas_data.places alter column outline drop not null;
  else
    alter table public.places alter column outline drop not null;
  end if;
end;
$migration$;

commit;
