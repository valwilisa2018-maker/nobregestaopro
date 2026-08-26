-- Exposes only the database clock so the browser can recover from a token
-- minted ahead of PostgREST. No user or application data is returned.
create or replace function public.get_server_epoch_ms()
returns bigint
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select floor(extract(epoch from clock_timestamp()) * 1000)::bigint;
$$;

revoke all on function public.get_server_epoch_ms() from public;
grant execute on function public.get_server_epoch_ms() to anon, authenticated;
