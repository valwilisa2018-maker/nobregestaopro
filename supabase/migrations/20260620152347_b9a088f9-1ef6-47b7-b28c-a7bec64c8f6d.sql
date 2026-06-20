-- project_folders: deixar o criador (ou admin) excluir
DROP POLICY IF EXISTS folders_delete_admin ON public.project_folders;
CREATE POLICY folders_delete ON public.project_folders
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR created_by = auth.uid()
    OR (kanban_card_id IS NOT NULL AND public.user_can_access_card(auth.uid(), sale_id, kanban_card_id))
  );

-- project_folder_files: mesma regra baseada na pasta
DROP POLICY IF EXISTS files_delete_admin ON public.project_folder_files;
CREATE POLICY files_delete ON public.project_folder_files
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_folders f
      WHERE f.id = project_folder_files.folder_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR f.created_by = auth.uid()
          OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
        )
    )
  );

-- project_folder_messages: mesma regra
DROP POLICY IF EXISTS msgs_delete_admin ON public.project_folder_messages;
CREATE POLICY msgs_delete ON public.project_folder_messages
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.project_folders f
      WHERE f.id = project_folder_messages.folder_id
        AND (
          public.has_role(auth.uid(), 'admin')
          OR f.created_by = auth.uid()
          OR public.user_can_access_card(auth.uid(), f.sale_id, f.kanban_card_id)
        )
    )
  );

-- Garante que arquivos e mensagens sejam removidos junto com a pasta
ALTER TABLE public.project_folder_files
  DROP CONSTRAINT IF EXISTS project_folder_files_folder_id_fkey,
  ADD CONSTRAINT project_folder_files_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES public.project_folders(id) ON DELETE CASCADE;

ALTER TABLE public.project_folder_messages
  DROP CONSTRAINT IF EXISTS project_folder_messages_folder_id_fkey,
  ADD CONSTRAINT project_folder_messages_folder_id_fkey
    FOREIGN KEY (folder_id) REFERENCES public.project_folders(id) ON DELETE CASCADE;