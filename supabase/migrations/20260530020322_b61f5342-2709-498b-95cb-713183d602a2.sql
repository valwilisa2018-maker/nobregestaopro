
-- =========================================================
-- GESTÃO NOBRE MKT - Schema completo
-- =========================================================

-- ===== ENUMS =====
CREATE TYPE public.app_role AS ENUM ('admin', 'vendedor', 'produtor', 'financeiro');
CREATE TYPE public.payment_status AS ENUM ('pago_total', 'pago_parcial', 'pendente');
CREATE TYPE public.payment_method AS ENUM ('pix', 'cartao', 'boleto');
CREATE TYPE public.invoice_status AS ENUM ('emitida', 'pendente', 'cancelada');

-- ===== PROFILES =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  phone TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_authenticated" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- ===== USER ROLES =====
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_select_own" ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "user_roles_admin_all" ON public.user_roles
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== AUTO-CREATE PROFILE + ADMIN ROLE FOR FIRST USER =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'vendedor');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== SELLERS (VENDEDORES) =====
CREATE TABLE public.sellers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  monthly_goal NUMERIC(12,2) DEFAULT 0,
  commission_rate NUMERIC(5,2) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sellers TO authenticated;
GRANT ALL ON public.sellers TO service_role;
ALTER TABLE public.sellers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sellers_read_all_auth" ON public.sellers FOR SELECT TO authenticated USING (true);
CREATE POLICY "sellers_admin_write" ON public.sellers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== PRODUCERS (PRODUTORES) =====
CREATE TABLE public.producers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  specialty TEXT,
  phone TEXT,
  email TEXT,
  average_delivery_days NUMERIC(5,2) DEFAULT 0,
  quality_score NUMERIC(3,1) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.producers TO authenticated;
GRANT ALL ON public.producers TO service_role;
ALTER TABLE public.producers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "producers_read_all_auth" ON public.producers FOR SELECT TO authenticated USING (true);
CREATE POLICY "producers_admin_write" ON public.producers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== SERVICE TYPES =====
CREATE TABLE public.service_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_types TO authenticated;
GRANT ALL ON public.service_types TO service_role;
ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_types_read" ON public.service_types FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_types_admin" ON public.service_types FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.service_types (name, sort_order) VALUES
  ('Vídeo', 10),('Influencer Pamela', 20),('Influencer Ester', 30),('Vídeos Flow', 40),
  ('Pixar 3D', 50),('Whiteboard', 60),('Influencer Realista', 70),('Explainer', 80),
  ('Logomarca', 90),('Site', 100),('Landing Page', 110),('Post para social media', 120),
  ('Sistema SaaS', 130),('Portfólio', 140);

-- ===== PACKAGES =====
CREATE TABLE public.packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  default_price NUMERIC(12,2) DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.packages TO authenticated;
GRANT ALL ON public.packages TO service_role;
ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "packages_read" ON public.packages FOR SELECT TO authenticated USING (true);
CREATE POLICY "packages_admin" ON public.packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- ===== CUSTOMERS =====
CREATE TABLE public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  document TEXT,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customers TO authenticated;
GRANT ALL ON public.customers TO service_role;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "customers_read" ON public.customers FOR SELECT TO authenticated USING (true);
CREATE POLICY "customers_write" ON public.customers FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor') OR public.has_role(auth.uid(), 'financeiro'));

-- ===== SALES =====
CREATE TABLE public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  seller_id UUID REFERENCES public.sellers(id) ON DELETE SET NULL,
  producer_id UUID REFERENCES public.producers(id) ON DELETE SET NULL,
  service_type_id UUID REFERENCES public.service_types(id) ON DELETE SET NULL,
  package_id UUID REFERENCES public.packages(id) ON DELETE SET NULL,
  service_quantity INTEGER NOT NULL DEFAULT 1,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_status payment_status NOT NULL DEFAULT 'pendente',
  payment_method payment_method,
  receipt_url TEXT,
  trello_link TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_sales_created_at ON public.sales(created_at DESC);
CREATE INDEX idx_sales_seller ON public.sales(seller_id);
CREATE INDEX idx_sales_producer ON public.sales(producer_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sales TO authenticated;
GRANT ALL ON public.sales TO service_role;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "sales_read" ON public.sales FOR SELECT TO authenticated USING (true);
CREATE POLICY "sales_insert" ON public.sales FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor'));
CREATE POLICY "sales_update" ON public.sales FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'vendedor') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "sales_delete_admin" ON public.sales FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== KANBAN COLUMNS =====
CREATE TABLE public.kanban_columns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_done BOOLEAN NOT NULL DEFAULT false,
  color TEXT DEFAULT '#ef4444',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.kanban_columns TO authenticated;
GRANT ALL ON public.kanban_columns TO service_role;
ALTER TABLE public.kanban_columns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kanban_columns_read" ON public.kanban_columns FOR SELECT TO authenticated USING (true);
CREATE POLICY "kanban_columns_admin" ON public.kanban_columns FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.kanban_columns (name, sort_order, is_default, is_done, color) VALUES
  ('Produção', 10, true, false, '#dc2626'),
  ('Serviços a Fazer', 20, false, false, '#f97316'),
  ('Alteração a Fazer', 30, false, false, '#eab308'),
  ('Alteração Pronta', 40, false, false, '#84cc16'),
  ('Vídeos Prontos', 50, false, false, '#22c55e'),
  ('Entregue', 60, false, true, '#10b981');

-- ===== SERVICE ORDERS (KANBAN CARDS) =====
CREATE TABLE public.service_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  column_id UUID NOT NULL REFERENCES public.kanban_columns(id) ON DELETE RESTRICT,
  service_index INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  priority INTEGER NOT NULL DEFAULT 2, -- 1=alta, 2=média, 3=baixa
  due_date DATE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_service_orders_column ON public.service_orders(column_id);
CREATE INDEX idx_service_orders_sale ON public.service_orders(sale_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.service_orders TO authenticated;
GRANT ALL ON public.service_orders TO service_role;
ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_orders_read" ON public.service_orders FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_orders_write" ON public.service_orders FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'produtor') OR public.has_role(auth.uid(), 'vendedor'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'produtor') OR public.has_role(auth.uid(), 'vendedor'));

-- ===== INVOICES (NOTAS FISCAIS) =====
CREATE TABLE public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  number TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status invoice_status NOT NULL DEFAULT 'pendente',
  file_url TEXT,
  issued_at DATE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.invoices TO authenticated;
GRANT ALL ON public.invoices TO service_role;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "invoices_read" ON public.invoices FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));
CREATE POLICY "invoices_write" ON public.invoices FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'financeiro'));

-- ===== GOALS (METAS) =====
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period TEXT NOT NULL CHECK (period IN ('daily','weekly','monthly','yearly')),
  target_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  seller_id UUID REFERENCES public.sellers(id) ON DELETE CASCADE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.goals TO authenticated;
GRANT ALL ON public.goals TO service_role;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "goals_read" ON public.goals FOR SELECT TO authenticated USING (true);
CREATE POLICY "goals_admin" ON public.goals FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.goals (period, target_amount) VALUES
  ('daily', 5000), ('weekly', 30000), ('monthly', 120000), ('yearly', 1500000);

-- ===== AUTO-CREATE SERVICE ORDERS ON SALE INSERT =====
CREATE OR REPLACE FUNCTION public.create_service_orders_for_sale()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  default_col UUID;
  i INTEGER;
  customer_name TEXT;
  st_name TEXT;
BEGIN
  SELECT id INTO default_col FROM public.kanban_columns WHERE is_default = true LIMIT 1;
  IF default_col IS NULL THEN
    SELECT id INTO default_col FROM public.kanban_columns ORDER BY sort_order LIMIT 1;
  END IF;

  SELECT name INTO customer_name FROM public.customers WHERE id = NEW.customer_id;
  SELECT name INTO st_name FROM public.service_types WHERE id = NEW.service_type_id;

  FOR i IN 1..GREATEST(NEW.service_quantity, 1) LOOP
    INSERT INTO public.service_orders (sale_id, column_id, service_index, title, description, sort_order)
    VALUES (
      NEW.id, default_col, i,
      COALESCE(customer_name, 'Cliente') || ' • ' || COALESCE(st_name, 'Serviço') || ' #' || i,
      NEW.notes, i
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_sale_created_create_orders
  AFTER INSERT ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.create_service_orders_for_sale();

-- ===== UPDATED_AT TRIGGERS =====
CREATE OR REPLACE FUNCTION public.tg_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tg_sales_updated BEFORE UPDATE ON public.sales
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_customers_updated BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_so_updated BEFORE UPDATE ON public.service_orders
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_sellers_updated BEFORE UPDATE ON public.sellers
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_producers_updated BEFORE UPDATE ON public.producers
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_invoices_updated BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();
CREATE TRIGGER tg_profiles_updated BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- ===== STORAGE: Receipts bucket =====
INSERT INTO storage.buckets (id, name, public) VALUES ('receipts', 'receipts', false)
  ON CONFLICT (id) DO NOTHING;

CREATE POLICY "receipts_authenticated_read" ON storage.objects FOR SELECT
  TO authenticated USING (bucket_id = 'receipts');
CREATE POLICY "receipts_authenticated_insert" ON storage.objects FOR INSERT
  TO authenticated WITH CHECK (bucket_id = 'receipts');
CREATE POLICY "receipts_authenticated_update" ON storage.objects FOR UPDATE
  TO authenticated USING (bucket_id = 'receipts');
CREATE POLICY "receipts_authenticated_delete" ON storage.objects FOR DELETE
  TO authenticated USING (bucket_id = 'receipts');
