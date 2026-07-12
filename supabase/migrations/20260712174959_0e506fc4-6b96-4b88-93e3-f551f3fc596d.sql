
CREATE OR REPLACE FUNCTION public.contact_to_pipeline_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  first_stage_id uuid;
  existing_id uuid;
  norm_phone text := regexp_replace(COALESCE(NEW.phone,''), '\D', '', 'g');
BEGIN
  IF NEW.user_id IS NULL OR norm_phone = '' THEN
    RETURN NEW;
  END IF;

  -- Ensure default stages exist for this user
  IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE user_id = NEW.user_id) THEN
    INSERT INTO public.pipeline_stages(user_id, name, color, position, is_system, is_won, is_lost) VALUES
      (NEW.user_id, 'Novo Lead',        '#3b82f6', 1, true, false, false),
      (NEW.user_id, 'Primeiro Contato', '#60a5fa', 2, true, false, false),
      (NEW.user_id, 'Qualificação',     '#a855f7', 3, true, false, false),
      (NEW.user_id, 'Negociação',       '#f97316', 4, true, false, false),
      (NEW.user_id, 'Fechado',          '#15803d', 5, true, true,  false),
      (NEW.user_id, 'Não Vendido',      '#ef4444', 6, true, false, true),
      (NEW.user_id, 'Pós-venda',        '#1e3a8a', 7, true, false, false)
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT id INTO first_stage_id
  FROM public.pipeline_stages
  WHERE user_id = NEW.user_id
  ORDER BY position ASC
  LIMIT 1;

  IF first_stage_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Skip if a deal with the same phone already exists for this user
  SELECT id INTO existing_id
  FROM public.pipeline_deals
  WHERE user_id = NEW.user_id
    AND (
      regexp_replace(COALESCE(phone,''), '\D', '', 'g') = norm_phone
      OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') = norm_phone
    )
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.pipeline_deals(
    user_id, stage_id, title, phone, whatsapp, tags, source, notes,
    priority, value_cents, links, checklist
  ) VALUES (
    NEW.user_id, first_stage_id,
    COALESCE(NULLIF(NEW.name,''), NEW.phone),
    NEW.phone, NEW.phone,
    COALESCE(NEW.tags, '{}'::text[]),
    COALESCE(NEW.source, 'contatos'),
    NEW.notes,
    'medium', 0, '{}'::jsonb, '[]'::jsonb
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[contact_to_pipeline_deal] user=% phone=% erro=% state=%',
    NEW.user_id, norm_phone, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contacts_to_pipeline ON public.contacts;
CREATE TRIGGER contacts_to_pipeline
AFTER INSERT ON public.contacts
FOR EACH ROW
EXECUTE FUNCTION public.contact_to_pipeline_deal();

-- Backfill: for each existing contact without a matching pipeline deal, create one
DO $$
DECLARE
  c record;
  first_stage_id uuid;
  norm text;
BEGIN
  FOR c IN SELECT * FROM public.contacts LOOP
    norm := regexp_replace(COALESCE(c.phone,''), '\D', '', 'g');
    IF c.user_id IS NULL OR norm = '' THEN CONTINUE; END IF;

    IF NOT EXISTS (SELECT 1 FROM public.pipeline_stages WHERE user_id = c.user_id) THEN
      INSERT INTO public.pipeline_stages(user_id, name, color, position, is_system, is_won, is_lost) VALUES
        (c.user_id, 'Novo Lead',        '#3b82f6', 1, true, false, false),
        (c.user_id, 'Primeiro Contato', '#60a5fa', 2, true, false, false),
        (c.user_id, 'Qualificação',     '#a855f7', 3, true, false, false),
        (c.user_id, 'Negociação',       '#f97316', 4, true, false, false),
        (c.user_id, 'Fechado',          '#15803d', 5, true, true,  false),
        (c.user_id, 'Não Vendido',      '#ef4444', 6, true, false, true),
        (c.user_id, 'Pós-venda',        '#1e3a8a', 7, true, false, false)
      ON CONFLICT DO NOTHING;
    END IF;

    SELECT id INTO first_stage_id FROM public.pipeline_stages
      WHERE user_id = c.user_id ORDER BY position ASC LIMIT 1;
    IF first_stage_id IS NULL THEN CONTINUE; END IF;

    IF EXISTS (
      SELECT 1 FROM public.pipeline_deals
      WHERE user_id = c.user_id
        AND (
          regexp_replace(COALESCE(phone,''),   '\D', '', 'g') = norm
          OR regexp_replace(COALESCE(whatsapp,''), '\D', '', 'g') = norm
        )
    ) THEN CONTINUE; END IF;

    INSERT INTO public.pipeline_deals(
      user_id, stage_id, title, phone, whatsapp, tags, source, notes,
      priority, value_cents, links, checklist
    ) VALUES (
      c.user_id, first_stage_id,
      COALESCE(NULLIF(c.name,''), c.phone),
      c.phone, c.phone,
      COALESCE(c.tags, '{}'::text[]),
      COALESCE(c.source, 'contatos'),
      c.notes,
      'medium', 0, '{}'::jsonb, '[]'::jsonb
    );
  END LOOP;
END $$;
