ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS company text,
  ADD COLUMN IF NOT EXISTS document text,
  ADD COLUMN IF NOT EXISTS invoice_number text;