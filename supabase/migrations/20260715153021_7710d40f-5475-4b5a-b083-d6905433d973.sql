
-- =========== PLANS ===========
CREATE TABLE public.plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  price_cents INTEGER NOT NULL DEFAULT 0,
  billing_period TEXT NOT NULL DEFAULT 'monthly' CHECK (billing_period IN ('monthly','yearly')),
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  limits JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_highlight BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  pagarme_plan_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.plans TO authenticated;
GRANT ALL ON public.plans TO service_role;

ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "plans_read_all_authenticated"
  ON public.plans FOR SELECT TO authenticated USING (true);

CREATE POLICY "plans_admin_write"
  ON public.plans FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER plans_updated_at
  BEFORE UPDATE ON public.plans
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- =========== SUBSCRIPTION (single row) ===========
CREATE TABLE public.subscription (
  id BOOLEAN PRIMARY KEY DEFAULT true CHECK (id = true),
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial','active','past_due','canceled','suspended')),
  started_at TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  pagarme_subscription_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.subscription TO authenticated;
GRANT ALL ON public.subscription TO service_role;

ALTER TABLE public.subscription ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscription_read_all_authenticated"
  ON public.subscription FOR SELECT TO authenticated USING (true);

CREATE POLICY "subscription_admin_write"
  ON public.subscription FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER subscription_updated_at
  BEFORE UPDATE ON public.subscription
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- =========== SEED 3 PLANS ===========
INSERT INTO public.plans (slug, name, description, price_cents, billing_period, is_highlight, sort_order, features, limits) VALUES
(
  'starter',
  'Starter',
  'Essencial para começar a organizar vendas e produção.',
  19700,
  'monthly',
  false,
  1,
  '[
    "Gestão de Vendas",
    "Cadastro de Clientes",
    "Kanban de Produção",
    "Notas Fiscais",
    "Dashboard básico",
    "Suporte por e-mail"
  ]'::jsonb,
  '{"max_users":3,"max_producers":1,"max_sales_per_month":100,"storage_gb":2}'::jsonb
),
(
  'pro',
  'Pro',
  'Para agências em crescimento que precisam de produção completa.',
  39700,
  'monthly',
  true,
  2,
  '[
    "Tudo do Starter",
    "Produtores ilimitados",
    "Pastas & Arquivos de projeto",
    "WhatsApp integrado (Evolution API)",
    "Operação e Meta (metas e ranking)",
    "Telão de vendas",
    "Comissões de vendedores",
    "Suporte prioritário"
  ]'::jsonb,
  '{"max_users":10,"max_producers":-1,"max_sales_per_month":1000,"storage_gb":25}'::jsonb
),
(
  'enterprise',
  'Enterprise',
  'Operação completa e sem limites para agências de alto volume.',
  79700,
  'monthly',
  false,
  3,
  '[
    "Tudo do Pro",
    "Pagamentos via Pagar.me integrado",
    "White-label (marca própria)",
    "Backup automático",
    "Auditoria completa",
    "Chat organizador com IA",
    "Transcrição de áudio por IA",
    "Suporte dedicado"
  ]'::jsonb,
  '{"max_users":-1,"max_producers":-1,"max_sales_per_month":-1,"storage_gb":-1}'::jsonb
);

-- initialize subscription row (no plan yet)
INSERT INTO public.subscription (id, status) VALUES (true, 'trial')
ON CONFLICT (id) DO NOTHING;
