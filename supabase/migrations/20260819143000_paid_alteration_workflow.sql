-- Venda paga de alteração: reutiliza o card existente, preserva a entrega
-- original e mantém pontos/minutagem fora da nova venda.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS sale_kind text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS alteration_service_order_id uuid REFERENCES public.service_orders(id) ON DELETE SET NULL;

ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_kind_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_sale_kind_check
  CHECK (sale_kind IN ('standard', 'alteration'));
CREATE INDEX IF NOT EXISTS idx_sales_alteration_service_order
  ON public.sales(alteration_service_order_id)
  WHERE alteration_service_order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.service_order_alterations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL UNIQUE REFERENCES public.sales(id) ON DELETE CASCADE,
  service_order_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  seller_id uuid REFERENCES public.sellers(id) ON DELETE SET NULL,
  producer_id uuid REFERENCES public.producers(id) ON DELETE SET NULL,
  original_producer_id uuid REFERENCES public.producers(id) ON DELETE SET NULL,
  original_column_id uuid REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  original_delivered_at timestamptz,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'cancelled')),
  notes text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.service_order_alterations ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_order_alterations TO authenticated;
GRANT ALL ON public.service_order_alterations TO service_role;
DROP POLICY IF EXISTS service_order_alterations_read ON public.service_order_alterations;
CREATE POLICY service_order_alterations_read ON public.service_order_alterations
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS service_order_alterations_write ON public.service_order_alterations;
CREATE POLICY service_order_alterations_write ON public.service_order_alterations
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

-- O gatilho antigo continua sendo a fonte única de criação dos cards normais,
-- mas não roda para uma venda vinculada a um card de alteração.
DROP TRIGGER IF EXISTS on_sale_created_create_orders ON public.sales;
CREATE TRIGGER on_sale_created_create_orders
  AFTER INSERT ON public.sales
  FOR EACH ROW
  WHEN (NEW.sale_kind = 'standard')
  EXECUTE FUNCTION public.create_service_orders_for_sale();

CREATE OR REPLACE FUNCTION public.tg_start_paid_alteration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.service_orders%ROWTYPE;
  v_alteration_column uuid;
BEGIN
  IF NEW.sale_kind <> 'alteration' THEN RETURN NEW; END IF;
  IF NEW.alteration_service_order_id IS NULL THEN
    RAISE EXCEPTION 'Selecione o card que recebera a alteracao';
  END IF;

  SELECT * INTO v_order FROM public.service_orders
  WHERE id = NEW.alteration_service_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Card da alteracao nao encontrado'; END IF;

  SELECT id INTO v_alteration_column FROM public.kanban_columns
  WHERE name = 'Alteração a Fazer'
  ORDER BY producer_id NULLS FIRST, sort_order LIMIT 1;
  IF v_alteration_column IS NULL THEN
    RAISE EXCEPTION 'Coluna Alteracao a Fazer nao encontrada no Kanban';
  END IF;

  INSERT INTO public.service_order_alterations (
    sale_id, service_order_id, seller_id, producer_id,
    original_producer_id, original_column_id, original_delivered_at,
    amount, paid_amount, notes
  ) VALUES (
    NEW.id, v_order.id, NEW.seller_id, NEW.producer_id,
    v_order.producer_id, v_order.column_id, v_order.delivered_at,
    NEW.total_amount, NEW.paid_amount, NEW.notes
  );

  UPDATE public.service_orders
  SET column_id = v_alteration_column,
      producer_id = COALESCE(NEW.producer_id, v_order.producer_id),
      sort_order = -floor(extract(epoch FROM now()))::integer
  WHERE id = v_order.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_start_paid_alteration ON public.sales;
CREATE TRIGGER trg_start_paid_alteration
AFTER INSERT ON public.sales
FOR EACH ROW WHEN (NEW.sale_kind = 'alteration')
EXECUTE FUNCTION public.tg_start_paid_alteration();

-- Preserva a data da entrega original durante a alteração. Assim o trabalho
-- original não some das comissões nem volta a gerar pontos ao ser finalizado.
CREATE OR REPLACE FUNCTION public.tg_set_service_order_delivery_date()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  old_done boolean := false;
  new_done boolean := false;
  has_active_alteration boolean := false;
BEGIN
  SELECT COALESCE(is_done, false) INTO new_done FROM public.kanban_columns WHERE id = NEW.column_id;
  IF TG_OP = 'INSERT' THEN
    IF new_done THEN NEW.delivered_at := COALESCE(NEW.delivered_at, now()); END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(is_done, false) INTO old_done FROM public.kanban_columns WHERE id = OLD.column_id;
  SELECT EXISTS (
    SELECT 1 FROM public.service_order_alterations
    WHERE service_order_id = NEW.id AND status = 'in_progress'
  ) INTO has_active_alteration;

  IF has_active_alteration THEN
    NEW.delivered_at := OLD.delivered_at;
  ELSIF NOT old_done AND new_done THEN
    NEW.delivered_at := now();
  ELSIF old_done AND NOT new_done THEN
    NEW.delivered_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_complete_paid_alteration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_done boolean := false;
BEGIN
  SELECT COALESCE(is_done, false) INTO v_done FROM public.kanban_columns WHERE id = NEW.column_id;
  IF v_done AND NEW.column_id IS DISTINCT FROM OLD.column_id THEN
    UPDATE public.service_order_alterations
    SET status = 'completed', completed_at = now(), producer_id = COALESCE(NEW.producer_id, producer_id)
    WHERE service_order_id = NEW.id AND status = 'in_progress';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_paid_alteration ON public.service_orders;
CREATE TRIGGER trg_complete_paid_alteration
AFTER UPDATE OF column_id ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.tg_complete_paid_alteration();

COMMENT ON COLUMN public.sales.alteration_service_order_id IS
  'Card existente reutilizado por uma venda paga de alteracao; nao gera novo card ou pontos.';
