
ALTER TABLE public.service_orders ALTER COLUMN sale_id DROP NOT NULL;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS color text;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS due_time time;
ALTER TABLE public.service_orders ADD COLUMN IF NOT EXISTS labels text[] NOT NULL DEFAULT '{}';
