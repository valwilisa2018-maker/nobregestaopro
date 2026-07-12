DROP POLICY IF EXISTS "read all comments" ON public.training_comments;
CREATE POLICY "read own or admin comments" ON public.training_comments
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'master'));