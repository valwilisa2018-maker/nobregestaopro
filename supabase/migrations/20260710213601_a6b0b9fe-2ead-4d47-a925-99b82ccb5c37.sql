
ALTER TABLE public.support_tickets
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS environment text,
  ADD COLUMN IF NOT EXISTS browser text,
  ADD COLUMN IF NOT EXISTS page_url text,
  ADD COLUMN IF NOT EXISTS attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rating integer,
  ADD COLUMN IF NOT EXISTS rating_comment text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS first_response_at timestamptz,
  ADD COLUMN IF NOT EXISTS ticket_number bigserial;

ALTER TABLE public.support_messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid REFERENCES public.support_messages(id) ON DELETE SET NULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.support_tickets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
