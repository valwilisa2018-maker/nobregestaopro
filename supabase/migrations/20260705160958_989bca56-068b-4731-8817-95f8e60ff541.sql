
CREATE TABLE public.quick_sends (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  text text,
  media_type text,
  media_mime text,
  media_name text,
  media_size integer,
  media_url text,
  storage_path text,
  is_ptt boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
CREATE INDEX quick_sends_user_id_idx ON public.quick_sends(user_id, created_at desc);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_sends TO authenticated;
GRANT ALL ON public.quick_sends TO service_role;
ALTER TABLE public.quick_sends ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own quick_sends select" ON public.quick_sends FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own quick_sends insert" ON public.quick_sends FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own quick_sends update" ON public.quick_sends FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own quick_sends delete" ON public.quick_sends FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE TRIGGER quick_sends_set_updated_at
  BEFORE UPDATE ON public.quick_sends
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
