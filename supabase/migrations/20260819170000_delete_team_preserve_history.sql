-- Permite excluir membros da equipe sem apagar a autoria histórica.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS seller_name_snapshot text,
  ADD COLUMN IF NOT EXISTS producer_name_snapshot text;
ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS producer_name_snapshot text;
ALTER TABLE public.service_order_alterations
  ADD COLUMN IF NOT EXISTS seller_name_snapshot text,
  ADD COLUMN IF NOT EXISTS producer_name_snapshot text,
  ADD COLUMN IF NOT EXISTS original_producer_name_snapshot text;
ALTER TABLE public.om_eventos
  ADD COLUMN IF NOT EXISTS producer_name_snapshot text,
  ALTER COLUMN producer_id DROP NOT NULL;

UPDATE public.sales s SET
  seller_name_snapshot = COALESCE(s.seller_name_snapshot, (SELECT se.name FROM public.sellers se WHERE se.id=s.seller_id)),
  producer_name_snapshot = COALESCE(s.producer_name_snapshot, (SELECT p.name FROM public.producers p WHERE p.id=s.producer_id));

UPDATE public.service_orders so
SET producer_name_snapshot = COALESCE(
  so.producer_name_snapshot,
  (SELECT p.name FROM public.producers p WHERE p.id=so.producer_id),
  (SELECT s.producer_name_snapshot FROM public.sales s WHERE s.id=so.sale_id)
);

UPDATE public.service_order_alterations a SET
  seller_name_snapshot = COALESCE(a.seller_name_snapshot, (SELECT se.name FROM public.sellers se WHERE se.id=a.seller_id)),
  producer_name_snapshot = COALESCE(a.producer_name_snapshot, (SELECT p.name FROM public.producers p WHERE p.id=a.producer_id)),
  original_producer_name_snapshot = COALESCE(a.original_producer_name_snapshot, (SELECT op.name FROM public.producers op WHERE op.id=a.original_producer_id));

UPDATE public.om_eventos e
SET producer_name_snapshot = COALESCE(e.producer_name_snapshot, p.name)
FROM public.producers p WHERE p.id = e.producer_id;

ALTER TABLE public.om_eventos DROP CONSTRAINT IF EXISTS om_eventos_producer_id_fkey;
ALTER TABLE public.om_eventos ADD CONSTRAINT om_eventos_producer_id_fkey
  FOREIGN KEY (producer_id) REFERENCES public.producers(id) ON DELETE SET NULL;
ALTER TABLE public.kanban_columns DROP CONSTRAINT IF EXISTS kanban_columns_producer_id_fkey;
ALTER TABLE public.kanban_columns ADD CONSTRAINT kanban_columns_producer_id_fkey
  FOREIGN KEY (producer_id) REFERENCES public.producers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_snapshot_team_names()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_TABLE_NAME = 'sales' THEN
    IF NEW.seller_id IS NOT NULL THEN SELECT name INTO NEW.seller_name_snapshot FROM public.sellers WHERE id=NEW.seller_id; END IF;
    IF NEW.producer_id IS NOT NULL THEN SELECT name INTO NEW.producer_name_snapshot FROM public.producers WHERE id=NEW.producer_id; END IF;
  ELSIF TG_TABLE_NAME = 'service_orders' THEN
    IF NEW.producer_id IS NOT NULL THEN SELECT name INTO NEW.producer_name_snapshot FROM public.producers WHERE id=NEW.producer_id; END IF;
  ELSIF TG_TABLE_NAME = 'om_eventos' THEN
    IF NEW.producer_id IS NOT NULL THEN SELECT name INTO NEW.producer_name_snapshot FROM public.producers WHERE id=NEW.producer_id; END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_snapshot_sales_team_names ON public.sales;
CREATE TRIGGER trg_snapshot_sales_team_names BEFORE INSERT OR UPDATE OF seller_id,producer_id ON public.sales
FOR EACH ROW EXECUTE FUNCTION public.tg_snapshot_team_names();
DROP TRIGGER IF EXISTS trg_snapshot_order_producer_name ON public.service_orders;
CREATE TRIGGER trg_snapshot_order_producer_name BEFORE INSERT OR UPDATE OF producer_id ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_snapshot_team_names();
DROP TRIGGER IF EXISTS trg_snapshot_event_producer_name ON public.om_eventos;
CREATE TRIGGER trg_snapshot_event_producer_name BEFORE INSERT OR UPDATE OF producer_id ON public.om_eventos
FOR EACH ROW EXECUTE FUNCTION public.tg_snapshot_team_names();

CREATE OR REPLACE FUNCTION public.delete_seller_preserving_history(p_seller_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT name INTO v_name FROM public.sellers WHERE id=p_seller_id FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Vendedor nao encontrado'; END IF;
  UPDATE public.sales SET seller_name_snapshot=v_name, seller_id=NULL WHERE seller_id=p_seller_id;
  UPDATE public.service_order_alterations SET seller_name_snapshot=v_name, seller_id=NULL WHERE seller_id=p_seller_id;
  DELETE FROM public.sellers WHERE id=p_seller_id;
END; $$;

CREATE OR REPLACE FUNCTION public.delete_producer_preserving_history(p_producer_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_name text;
BEGIN
  IF NOT public.has_role(auth.uid(),'admin'::public.app_role) THEN RAISE EXCEPTION 'Sem permissao'; END IF;
  SELECT name INTO v_name FROM public.producers WHERE id=p_producer_id FOR UPDATE;
  IF v_name IS NULL THEN RAISE EXCEPTION 'Produtor nao encontrado'; END IF;
  UPDATE public.sales SET producer_name_snapshot=v_name, producer_id=NULL WHERE producer_id=p_producer_id;
  UPDATE public.service_orders SET producer_name_snapshot=v_name, producer_id=NULL WHERE producer_id=p_producer_id;
  UPDATE public.service_order_alterations SET producer_name_snapshot=v_name, producer_id=NULL WHERE producer_id=p_producer_id;
  UPDATE public.service_order_alterations SET original_producer_name_snapshot=v_name, original_producer_id=NULL WHERE original_producer_id=p_producer_id;
  UPDATE public.om_eventos SET producer_name_snapshot=v_name, producer_id=NULL WHERE producer_id=p_producer_id;
  DELETE FROM public.producers WHERE id=p_producer_id;
END; $$;

REVOKE ALL ON FUNCTION public.delete_seller_preserving_history(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.delete_producer_preserving_history(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_seller_preserving_history(uuid) TO authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.delete_producer_preserving_history(uuid) TO authenticated,service_role;
