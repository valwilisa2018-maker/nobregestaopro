
-- Folders independent from sales/kanban: optional linking only
DROP TRIGGER IF EXISTS trg_create_project_folder ON public.service_orders;
DROP FUNCTION IF EXISTS public.create_project_folder_for_card();

ALTER TABLE public.project_folders DROP CONSTRAINT IF EXISTS project_folders_kanban_card_id_key;
ALTER TABLE public.project_folders ALTER COLUMN kanban_card_id DROP NOT NULL;

-- Replace RLS policies to allow standalone folders (created_by) + linked-card access
DROP POLICY IF EXISTS "folders_select" ON public.project_folders;
DROP POLICY IF EXISTS "folders_insert" ON public.project_folders;
DROP POLICY IF EXISTS "folders_update" ON public.project_folders;

CREATE POLICY "folders_select" ON public.project_folders FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
);

CREATE POLICY "folders_insert" ON public.project_folders FOR INSERT TO authenticated
WITH CHECK (
  created_by = auth.uid()
  OR public.has_role(auth.uid(), 'admin')
);

CREATE POLICY "folders_update" ON public.project_folders FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR created_by = auth.uid()
  OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
);
