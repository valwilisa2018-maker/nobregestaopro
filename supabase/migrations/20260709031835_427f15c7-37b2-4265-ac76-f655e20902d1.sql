REVOKE EXECUTE ON FUNCTION public.pipeline_deals_touch_interaction() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pipeline_deals_track_stage() FROM PUBLIC, anon;

CREATE POLICY "own video_jobs insert" ON public.video_jobs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own video_jobs update" ON public.video_jobs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own video_jobs delete" ON public.video_jobs FOR DELETE TO authenticated USING (auth.uid() = user_id);