
CREATE POLICY "insert own roles" ON public.user_roles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own roles" ON public.user_roles FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "update own roles" ON public.user_roles FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
