
ALTER TABLE public.broadcasts
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'list',
  ADD COLUMN IF NOT EXISTS source_value jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_per_min integer NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS humanize_min integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS humanize_max integer NOT NULL DEFAULT 18,
  ADD COLUMN IF NOT EXISTS window_start time,
  ADD COLUMN IF NOT EXISTS window_end time,
  ADD COLUMN IF NOT EXISTS ignore_holidays boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS continue_next_day boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dedupe boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS ignore_responded boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS stop_on_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS daily_limit integer,
  ADD COLUMN IF NOT EXISTS sent_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS day_marker date,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS estimated_finish_at timestamptz,
  ADD COLUMN IF NOT EXISTS responded_count integer NOT NULL DEFAULT 0;

ALTER TABLE public.broadcast_recipients
  ADD COLUMN IF NOT EXISTS responded_at timestamptz;
