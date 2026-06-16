
-- =========================================================
-- Pastas e Arquivos + Chat Organizador
-- =========================================================

-- 1) project_folders
CREATE TABLE public.project_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid REFERENCES public.sales(id) ON DELETE CASCADE,
  kanban_card_id uuid NOT NULL REFERENCES public.service_orders(id) ON DELETE CASCADE,
  client_name text,
  service_type text,
  folder_name text NOT NULL,
  google_drive_link text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kanban_card_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_folders TO authenticated;
GRANT ALL ON public.project_folders TO service_role;

ALTER TABLE public.project_folders ENABLE ROW LEVEL SECURITY;

-- Helper: does current user have access to a given sale / service_order?
CREATE OR REPLACE FUNCTION public.user_can_access_card(_user_id uuid, _sale_id uuid, _card_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin')
    OR EXISTS (
      SELECT 1 FROM public.sales s
      JOIN public.sellers se ON se.id = s.seller_id
      WHERE s.id = _sale_id AND se.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.service_orders so
      LEFT JOIN public.producers p ON p.id = so.producer_id
      WHERE so.id = _card_id AND p.user_id = _user_id
    )
    OR EXISTS (
      SELECT 1 FROM public.sales s
      LEFT JOIN public.producers p ON p.id = s.producer_id
      WHERE s.id = _sale_id AND p.user_id = _user_id
    );
$$;

CREATE POLICY "folders_select" ON public.project_folders FOR SELECT TO authenticated
USING (public.user_can_access_card(auth.uid(), sale_id, kanban_card_id));

CREATE POLICY "folders_insert" ON public.project_folders FOR INSERT TO authenticated
WITH CHECK (public.user_can_access_card(auth.uid(), sale_id, kanban_card_id));

CREATE POLICY "folders_update" ON public.project_folders FOR UPDATE TO authenticated
USING (public.user_can_access_card(auth.uid(), sale_id, kanban_card_id));

CREATE POLICY "folders_delete_admin" ON public.project_folders FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_project_folders_updated_at
BEFORE UPDATE ON public.project_folders
FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- 2) project_folder_files
CREATE TABLE public.project_folder_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.project_folders(id) ON DELETE CASCADE,
  sale_id uuid,
  kanban_card_id uuid,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_type text,
  file_size bigint,
  file_category text NOT NULL CHECK (file_category IN ('roteiro','imagens','videos','pdfs','referencias','audios','entrega_final','outros')),
  uploaded_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pff_folder ON public.project_folder_files(folder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_folder_files TO authenticated;
GRANT ALL ON public.project_folder_files TO service_role;

ALTER TABLE public.project_folder_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "files_select" ON public.project_folder_files FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_folders f WHERE f.id = folder_id
  AND public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)));

CREATE POLICY "files_insert" ON public.project_folder_files FOR INSERT TO authenticated
WITH CHECK (EXISTS (SELECT 1 FROM public.project_folders f WHERE f.id = folder_id
  AND public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)));

CREATE POLICY "files_update" ON public.project_folder_files FOR UPDATE TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_folders f WHERE f.id = folder_id
  AND public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)));

CREATE POLICY "files_delete_admin" ON public.project_folder_files FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 3) project_folder_messages
CREATE TABLE public.project_folder_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  folder_id uuid NOT NULL REFERENCES public.project_folders(id) ON DELETE CASCADE,
  sale_id uuid,
  kanban_card_id uuid,
  message text,
  audio_url text,
  file_url text,
  file_id uuid REFERENCES public.project_folder_files(id) ON DELETE SET NULL,
  sender_id uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_pfm_folder ON public.project_folder_messages(folder_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_folder_messages TO authenticated;
GRANT ALL ON public.project_folder_messages TO service_role;

ALTER TABLE public.project_folder_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "msgs_select" ON public.project_folder_messages FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.project_folders f WHERE f.id = folder_id
  AND public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)));

CREATE POLICY "msgs_insert" ON public.project_folder_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND EXISTS (SELECT 1 FROM public.project_folders f WHERE f.id = folder_id
  AND public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)));

CREATE POLICY "msgs_delete_admin" ON public.project_folder_messages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- 4) Trigger: auto-create folder when service_order is inserted
CREATE OR REPLACE FUNCTION public.create_project_folder_for_card()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer text;
  v_service text;
  v_date date;
  v_name text;
BEGIN
  SELECT c.name, st.name, COALESCE(s.sale_date, CURRENT_DATE)
    INTO v_customer, v_service, v_date
  FROM public.sales s
  LEFT JOIN public.customers c ON c.id = s.customer_id
  LEFT JOIN public.service_types st ON st.id = s.service_type_id
  WHERE s.id = NEW.sale_id;

  v_name := COALESCE(v_customer,'Cliente') || ' - ' || COALESCE(v_service,'Serviço') || ' - ' || to_char(v_date, 'DD-MM-YYYY');

  INSERT INTO public.project_folders (sale_id, kanban_card_id, client_name, service_type, folder_name)
  VALUES (NEW.sale_id, NEW.id, v_customer, v_service, v_name)
  ON CONFLICT (kanban_card_id) DO NOTHING;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_create_project_folder
AFTER INSERT ON public.service_orders
FOR EACH ROW EXECUTE FUNCTION public.create_project_folder_for_card();

-- 5) Backfill for existing cards
INSERT INTO public.project_folders (sale_id, kanban_card_id, client_name, service_type, folder_name)
SELECT
  so.sale_id, so.id, c.name, st.name,
  COALESCE(c.name,'Cliente') || ' - ' || COALESCE(st.name,'Serviço') || ' - ' || to_char(COALESCE(s.sale_date, so.created_at::date), 'DD-MM-YYYY')
FROM public.service_orders so
LEFT JOIN public.sales s ON s.id = so.sale_id
LEFT JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.service_types st ON st.id = s.service_type_id
ON CONFLICT (kanban_card_id) DO NOTHING;
