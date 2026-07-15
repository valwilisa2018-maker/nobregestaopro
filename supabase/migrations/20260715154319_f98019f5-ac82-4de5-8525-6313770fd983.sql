-- master_accounts
CREATE TABLE IF NOT EXISTS public.master_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  document text,
  plan_id uuid REFERENCES public.plans(id) ON DELETE SET NULL,
  custom_price_cents integer,
  status text NOT NULL DEFAULT 'trial'
    CHECK (status IN ('trial','active','past_due','suspended','canceled')),
  billing_day smallint NOT NULL DEFAULT 1 CHECK (billing_day BETWEEN 1 AND 28),
  activated_at timestamptz,
  next_billing_at date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_accounts TO authenticated;
GRANT ALL ON public.master_accounts TO service_role;

ALTER TABLE public.master_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_accounts_super_admin_all ON public.master_accounts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER master_accounts_updated_at
  BEFORE UPDATE ON public.master_accounts
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX IF NOT EXISTS idx_master_accounts_status ON public.master_accounts(status);
CREATE INDEX IF NOT EXISTS idx_master_accounts_next_billing ON public.master_accounts(next_billing_at);

-- master_account_invoices
CREATE TABLE IF NOT EXISTS public.master_account_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES public.master_accounts(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL,
  reference_month date NOT NULL,
  due_date date NOT NULL,
  paid_at timestamptz,
  payment_method text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','paid','overdue','canceled','refunded')),
  pagarme_charge_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.master_account_invoices TO authenticated;
GRANT ALL ON public.master_account_invoices TO service_role;

ALTER TABLE public.master_account_invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY master_invoices_super_admin_all ON public.master_account_invoices
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

CREATE TRIGGER master_invoices_updated_at
  BEFORE UPDATE ON public.master_account_invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

CREATE INDEX IF NOT EXISTS idx_master_invoices_account ON public.master_account_invoices(account_id);
CREATE INDEX IF NOT EXISTS idx_master_invoices_status ON public.master_account_invoices(status);
CREATE INDEX IF NOT EXISTS idx_master_invoices_due ON public.master_account_invoices(due_date);

-- Promote the first user (dono da plataforma) to super_admin
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'super_admin'::public.app_role
FROM auth.users
ORDER BY created_at ASC
LIMIT 1
ON CONFLICT (user_id, role) DO NOTHING;