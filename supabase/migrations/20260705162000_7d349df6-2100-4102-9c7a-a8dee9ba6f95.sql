
REVOKE ALL ON FUNCTION public.purge_old_messages_media() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_messages_media() TO postgres, service_role;
