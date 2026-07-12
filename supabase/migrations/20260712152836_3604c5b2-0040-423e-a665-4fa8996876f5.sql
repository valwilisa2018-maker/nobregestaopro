DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ILIKE '%has_role(auth.uid()%' OR with_check ILIKE '%has_role(auth.uid()%')
      AND tablename IN (
        'agents',
        'ai_providers',
        'api_keys',
        'audio_messages',
        'billing_events',
        'clients',
        'connections',
        'contacts',
        'conversations',
        'documents',
        'flows',
        'integrations',
        'knowledge_documents',
        'logs',
        'messages',
        'pipeline_activities',
        'pipeline_attachments',
        'pipeline_deals',
        'pipeline_stages',
        'prompts',
        'tools',
        'usage_counters',
        'video_jobs',
        'webhooks',
        'white_label'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- Recreate strict owner-only policies for pipeline tables where previous policies allowed master-wide access.
DROP POLICY IF EXISTS "own activities" ON public.pipeline_activities;
CREATE POLICY "own activities" ON public.pipeline_activities
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own attachments" ON public.pipeline_attachments;
CREATE POLICY "own attachments" ON public.pipeline_attachments
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own deals" ON public.pipeline_deals;
CREATE POLICY "own deals" ON public.pipeline_deals
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "own stages" ON public.pipeline_stages;
CREATE POLICY "own stages" ON public.pipeline_stages
FOR ALL TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Notifications: users read only their own notifications; master management stays through dedicated policies/functions.
DROP POLICY IF EXISTS "user reads own notifications" ON public.notifications;
CREATE POLICY "user reads own notifications" ON public.notifications
FOR SELECT TO authenticated
USING (auth.uid() = user_id);

-- Training comments: users can delete only their own comments in the client module.
DROP POLICY IF EXISTS "delete own or admin" ON public.training_comments;
CREATE POLICY "delete own comments" ON public.training_comments
FOR DELETE TO authenticated
USING (auth.uid() = user_id);