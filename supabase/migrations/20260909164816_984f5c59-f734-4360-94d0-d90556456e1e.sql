DO $$
DECLARE v_src text;
BEGIN
  SELECT prosrc INTO v_src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='admin_reset_platform';
  IF v_src IS NOT NULL AND position('has_role' in v_src) = 0 THEN
    v_src := replace(v_src,
      'RAISE EXCEPTION ''Usuário precisa estar autenticado'' USING ERRCODE = ''42501'';',
      'RAISE EXCEPTION ''Usuário precisa estar autenticado'' USING ERRCODE = ''42501'';
  END IF;

  IF NOT (public.has_role(uid, ''admin''::public.app_role) OR public.has_role(uid, ''super_admin''::public.app_role)) THEN
    RAISE EXCEPTION ''Apenas administradores podem executar esta ação'' USING ERRCODE = ''42501'';');
    EXECUTE 'CREATE OR REPLACE FUNCTION public.admin_reset_platform() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $f$' || v_src || '$f$';
  END IF;
END $$;

REVOKE EXECUTE ON FUNCTION public.purge_old_project_folders() FROM authenticated;