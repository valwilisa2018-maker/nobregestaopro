-- Restore Data API privileges used by the authenticated web application.
-- GRANT controls whether a table is reachable; RLS continues to control
-- which rows each signed-in user may read or change.

grant usage on schema public to authenticated;

-- Work one object at a time. Supabase may keep extension-owned objects such
-- as spatial_ref_sys in public; lack of ownership over one of those objects
-- must not roll back access restoration for every application table.
do $$
declare
  target record;
begin
  for target in
    select format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    begin
      execute format(
        'grant select, insert, update, delete on table %s to authenticated',
        target.qualified_name
      );
      execute format('alter table %s enable row level security', target.qualified_name);
    exception
      when insufficient_privilege then
        raise notice 'Skipping extension/internal table %', target.qualified_name;
    end;
  end loop;

  for target in
    select format('%I.%I', n.nspname, c.relname) as qualified_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'S'
  loop
    begin
      execute format(
        'grant usage, select on sequence %s to authenticated',
        target.qualified_name
      );
    exception
      when insufficient_privilege then
        raise notice 'Skipping extension/internal sequence %', target.qualified_name;
    end;
  end loop;
end
$$;
