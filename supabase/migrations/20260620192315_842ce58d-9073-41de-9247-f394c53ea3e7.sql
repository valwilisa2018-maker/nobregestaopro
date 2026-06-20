ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS video_duration_seconds INTEGER;