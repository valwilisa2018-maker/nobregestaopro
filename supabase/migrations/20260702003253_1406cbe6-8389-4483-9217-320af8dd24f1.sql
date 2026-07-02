
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS follow_up_step integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_follow_up_at timestamptz,
  ADD COLUMN IF NOT EXISTS follow_up_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS alert_phone text;

CREATE INDEX IF NOT EXISTS idx_conversations_followup
  ON public.conversations (next_follow_up_at)
  WHERE follow_up_paused = false;
