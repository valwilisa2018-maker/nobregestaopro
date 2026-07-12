
-- 1) Redefine defaults para 7 etapas
CREATE OR REPLACE FUNCTION public.ensure_default_pipeline_stages()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  cnt int;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  SELECT count(*) INTO cnt FROM public.pipeline_stages WHERE user_id = uid;
  IF cnt > 0 THEN RETURN; END IF;
  INSERT INTO public.pipeline_stages(user_id, name, color, position, is_system, is_won, is_lost) VALUES
    (uid, 'Novo Lead',        '#3b82f6', 1, true, false, false),
    (uid, 'Primeiro Contato', '#60a5fa', 2, true, false, false),
    (uid, 'Qualificação',     '#a855f7', 3, true, false, false),
    (uid, 'Negociação',       '#f97316', 4, true, false, false),
    (uid, 'Fechado',          '#15803d', 5, true, true,  false),
    (uid, 'Não Vendido',      '#ef4444', 6, true, false, true),
    (uid, 'Pós-venda',        '#1e3a8a', 7, true, false, false);
END $function$;

-- 2) Consolidação para cada usuário existente
DO $$
DECLARE
  u RECORD;
  s_new_lead uuid; s_first uuid; s_qual uuid; s_nego uuid;
  s_won uuid; s_lost uuid; s_post uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.pipeline_stages LOOP
    -- garante existência das 7 etapas alvo (por nome), criando as que faltarem
    INSERT INTO public.pipeline_stages(user_id, name, color, position, is_system, is_won, is_lost)
    SELECT u.user_id, x.name, x.color, x.pos, true, x.won, x.lost FROM (VALUES
      ('Novo Lead','#3b82f6',1,false,false),
      ('Primeiro Contato','#60a5fa',2,false,false),
      ('Qualificação','#a855f7',3,false,false),
      ('Negociação','#f97316',4,false,false),
      ('Fechado','#15803d',5,true,false),
      ('Não Vendido','#ef4444',6,false,true),
      ('Pós-venda','#1e3a8a',7,false,false)
    ) AS x(name,color,pos,won,lost)
    WHERE NOT EXISTS (
      SELECT 1 FROM public.pipeline_stages ps WHERE ps.user_id = u.user_id AND ps.name = x.name
    );

    SELECT id INTO s_new_lead FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Novo Lead' LIMIT 1;
    SELECT id INTO s_first    FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Primeiro Contato' LIMIT 1;
    SELECT id INTO s_qual     FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Qualificação' LIMIT 1;
    SELECT id INTO s_nego     FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Negociação' LIMIT 1;
    SELECT id INTO s_won      FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Fechado' LIMIT 1;
    SELECT id INTO s_lost     FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Não Vendido' LIMIT 1;
    SELECT id INTO s_post     FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Pós-venda' LIMIT 1;

    -- Remapeia cartões e atividades das etapas antigas
    -- Apresentação → Qualificação
    UPDATE public.pipeline_deals SET stage_id = s_qual
      WHERE user_id=u.user_id AND stage_id IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Apresentação');
    -- Proposta Enviada, Follow-up → Negociação
    UPDATE public.pipeline_deals SET stage_id = s_nego
      WHERE user_id=u.user_id AND stage_id IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Proposta Enviada','Follow-up'));
    -- Fechamento, Pagamento → Fechado
    UPDATE public.pipeline_deals SET stage_id = s_won
      WHERE user_id=u.user_id AND stage_id IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Fechamento','Pagamento'));
    -- Implantação, Cliente Recorrente → Pós-venda
    UPDATE public.pipeline_deals SET stage_id = s_post
      WHERE user_id=u.user_id AND stage_id IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Implantação','Cliente Recorrente'));
    -- Perdido → Não Vendido
    UPDATE public.pipeline_deals SET stage_id = s_lost
      WHERE user_id=u.user_id AND stage_id IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Perdido');

    -- Atividades: from_stage / to_stage
    UPDATE public.pipeline_activities SET from_stage = s_qual
      WHERE user_id=u.user_id AND from_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Apresentação');
    UPDATE public.pipeline_activities SET to_stage = s_qual
      WHERE user_id=u.user_id AND to_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Apresentação');
    UPDATE public.pipeline_activities SET from_stage = s_nego
      WHERE user_id=u.user_id AND from_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Proposta Enviada','Follow-up'));
    UPDATE public.pipeline_activities SET to_stage = s_nego
      WHERE user_id=u.user_id AND to_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Proposta Enviada','Follow-up'));
    UPDATE public.pipeline_activities SET from_stage = s_won
      WHERE user_id=u.user_id AND from_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Fechamento','Pagamento'));
    UPDATE public.pipeline_activities SET to_stage = s_won
      WHERE user_id=u.user_id AND to_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Fechamento','Pagamento'));
    UPDATE public.pipeline_activities SET from_stage = s_post
      WHERE user_id=u.user_id AND from_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Implantação','Cliente Recorrente'));
    UPDATE public.pipeline_activities SET to_stage = s_post
      WHERE user_id=u.user_id AND to_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name IN ('Implantação','Cliente Recorrente'));
    UPDATE public.pipeline_activities SET from_stage = s_lost
      WHERE user_id=u.user_id AND from_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Perdido');
    UPDATE public.pipeline_activities SET to_stage = s_lost
      WHERE user_id=u.user_id AND to_stage IN (SELECT id FROM public.pipeline_stages WHERE user_id=u.user_id AND name='Perdido');

    -- Remove etapas antigas não mais utilizadas
    DELETE FROM public.pipeline_stages
      WHERE user_id=u.user_id
        AND name IN ('Apresentação','Proposta Enviada','Follow-up','Fechamento','Pagamento','Implantação','Cliente Recorrente','Perdido');

    -- Normaliza posições e flags das 7 etapas alvo
    UPDATE public.pipeline_stages SET position=1, is_won=false, is_lost=false WHERE id=s_new_lead;
    UPDATE public.pipeline_stages SET position=2, is_won=false, is_lost=false WHERE id=s_first;
    UPDATE public.pipeline_stages SET position=3, is_won=false, is_lost=false WHERE id=s_qual;
    UPDATE public.pipeline_stages SET position=4, is_won=false, is_lost=false WHERE id=s_nego;
    UPDATE public.pipeline_stages SET position=5, is_won=true,  is_lost=false WHERE id=s_won;
    UPDATE public.pipeline_stages SET position=6, is_won=false, is_lost=true  WHERE id=s_lost;
    UPDATE public.pipeline_stages SET position=7, is_won=false, is_lost=false WHERE id=s_post;
  END LOOP;
END $$;
