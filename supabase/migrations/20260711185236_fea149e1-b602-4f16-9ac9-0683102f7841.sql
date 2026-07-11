
CREATE TABLE public.training_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  watched_at timestamptz NOT NULL DEFAULT now(),
  progress_seconds integer NOT NULL DEFAULT 0,
  completed boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_progress TO authenticated;
GRANT ALL ON public.training_progress TO service_role;
ALTER TABLE public.training_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own progress" ON public.training_progress FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER trg_training_progress_updated
  BEFORE UPDATE ON public.training_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.training_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_key text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.training_comments TO authenticated;
GRANT ALL ON public.training_comments TO service_role;
ALTER TABLE public.training_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read all comments" ON public.training_comments FOR SELECT
  TO authenticated USING (true);
CREATE POLICY "insert own comment" ON public.training_comments FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "update own comment" ON public.training_comments FOR UPDATE
  TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "delete own or admin" ON public.training_comments FOR DELETE
  TO authenticated USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(),'admin')
    OR public.has_role(auth.uid(),'master')
  );
CREATE TRIGGER trg_training_comments_updated
  BEFORE UPDATE ON public.training_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_training_comments_module ON public.training_comments(module_key, created_at DESC);
