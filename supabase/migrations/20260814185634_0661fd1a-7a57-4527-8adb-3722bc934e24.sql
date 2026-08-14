CREATE OR REPLACE FUNCTION public.link_person_to_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid;
BEGIN
  IF NEW.user_id IS NULL AND NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    SELECT u.id INTO _uid
    FROM auth.users u
    WHERE lower(u.email) = lower(btrim(NEW.email))
    ORDER BY u.created_at
    LIMIT 1;
    IF _uid IS NOT NULL THEN
      NEW.user_id := _uid;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_link_producer_user ON public.producers;
CREATE TRIGGER tg_link_producer_user
BEFORE INSERT OR UPDATE OF email, user_id ON public.producers
FOR EACH ROW EXECUTE FUNCTION public.link_person_to_auth_user();

DROP TRIGGER IF EXISTS tg_link_seller_user ON public.sellers;
CREATE TRIGGER tg_link_seller_user
BEFORE INSERT OR UPDATE OF email, user_id ON public.sellers
FOR EACH ROW EXECUTE FUNCTION public.link_person_to_auth_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  END IF;

  UPDATE public.producers p SET user_id = NEW.id
  WHERE p.user_id IS NULL AND lower(btrim(p.email)) = lower(NEW.email);

  UPDATE public.sellers s SET user_id = NEW.id
  WHERE s.user_id IS NULL AND lower(btrim(s.email)) = lower(NEW.email);

  RETURN NEW;
END;
$$;

UPDATE public.producers p SET user_id = u.id
FROM auth.users u
WHERE p.user_id IS NULL AND lower(btrim(p.email)) = lower(u.email);

UPDATE public.sellers s SET user_id = u.id
FROM auth.users u
WHERE s.user_id IS NULL AND lower(btrim(s.email)) = lower(u.email);