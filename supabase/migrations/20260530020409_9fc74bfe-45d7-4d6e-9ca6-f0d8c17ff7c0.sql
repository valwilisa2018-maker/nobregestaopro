
-- Fix search_path on tg_updated_at trigger function
CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public
AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;
