ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'paid',
  ADD COLUMN IF NOT EXISTS down_payment_cents bigint NOT NULL DEFAULT 0;