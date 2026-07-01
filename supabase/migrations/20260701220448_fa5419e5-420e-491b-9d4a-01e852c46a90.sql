-- Promote main user to admin and add admin-wide read policies

INSERT INTO public.user_roles (user_id, role)
VALUES ('a66d5109-5b79-4c80-af9c-9a975e62d6f3', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;

-- Admin can view all rows across tenant tables
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'agents','ai_providers','api_keys','audio_messages','billing_events',
    'clients','connections','conversations','documents','flows',
    'integrations','knowledge_documents','logs','messages','profiles',
    'prompts','settings','tools','webhooks','white_label'
  ]
  LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS "Admins can view all %1$s" ON public.%1$I;
       CREATE POLICY "Admins can view all %1$s" ON public.%1$I
         FOR SELECT TO authenticated
         USING (public.has_role(auth.uid(), ''admin''));',
      t
    );
  END LOOP;
END $$;