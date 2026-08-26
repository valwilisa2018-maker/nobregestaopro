-- Restore Data API privileges used by the authenticated web application.
-- GRANT controls whether a table is reachable; RLS continues to control
-- which rows each signed-in user may read or change.

grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Keep future tables and sequences reachable by the application as well.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- Every base/partitioned table exposed through the public Data API must use
-- RLS. Existing policies remain unchanged and continue enforcing access.
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
    execute format('alter table %s enable row level security', target.qualified_name);
  end loop;
end
$$;
