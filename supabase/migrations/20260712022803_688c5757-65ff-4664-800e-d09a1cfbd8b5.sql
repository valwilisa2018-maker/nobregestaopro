
ALTER TABLE public.training_comments ADD COLUMN IF NOT EXISTS rating smallint CHECK (rating BETWEEN 1 AND 5);

DROP POLICY IF EXISTS "read own or admin comments" ON public.training_comments;
CREATE POLICY "read all comments" ON public.training_comments
  FOR SELECT TO authenticated USING (true);
