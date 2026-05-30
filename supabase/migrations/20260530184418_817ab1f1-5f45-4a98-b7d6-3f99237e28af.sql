
-- Enum for expense status
DO $$ BEGIN
  CREATE TYPE public.expense_status AS ENUM ('pago','pendente','atrasado');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum for expense category
DO $$ BEGIN
  CREATE TYPE public.expense_category AS ENUM (
    'trafego_pago','impostos','nota_fiscal','aluguel','agua','luz','internet',
    'limpeza','folha_pagamento','comissoes','ferramentas','producao','outras'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Enum for cash movement type
DO $$ BEGIN
  CREATE TYPE public.cash_movement_type AS ENUM ('entrada','saida');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  category public.expense_category NOT NULL DEFAULT 'outras',
  amount NUMERIC NOT NULL DEFAULT 0,
  due_date DATE,
  paid_date DATE,
  status public.expense_status NOT NULL DEFAULT 'pendente',
  supplier TEXT,
  receipt_url TEXT,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "expenses_read" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "expenses_write" ON public.expenses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

CREATE TRIGGER trg_expenses_updated_at BEFORE UPDATE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX IF NOT EXISTS idx_expenses_due ON public.expenses(due_date);
CREATE INDEX IF NOT EXISTS idx_expenses_paid ON public.expenses(paid_date);
CREATE INDEX IF NOT EXISTS idx_expenses_status ON public.expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON public.expenses(category);

-- Cash movements (manual cash adjustments)
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  movement_type public.cash_movement_type NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  category TEXT,
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;

ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cash_movements_read" ON public.cash_movements FOR SELECT TO authenticated USING (true);
CREATE POLICY "cash_movements_write" ON public.cash_movements FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro'));

CREATE INDEX IF NOT EXISTS idx_cash_movements_date ON public.cash_movements(movement_date);

-- Storage bucket for expense receipts
INSERT INTO storage.buckets (id, name, public) VALUES ('expense-receipts','expense-receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "expense_receipts_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts');
CREATE POLICY "expense_receipts_write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')));
CREATE POLICY "expense_receipts_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')));
CREATE POLICY "expense_receipts_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'financeiro')));
