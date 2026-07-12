
ALTER TABLE public.sale_products
  ADD COLUMN IF NOT EXISTS category text,
  ADD COLUMN IF NOT EXISTS brand text,
  ADD COLUMN IF NOT EXISTS sku text,
  ADD COLUMN IF NOT EXISTS unit text,
  ADD COLUMN IF NOT EXISTS stock_quantity integer,
  ADD COLUMN IF NOT EXISTS cost_cents integer,
  ADD COLUMN IF NOT EXISTS weight_grams integer,
  ADD COLUMN IF NOT EXISTS width_cm numeric,
  ADD COLUMN IF NOT EXISTS height_cm numeric,
  ADD COLUMN IF NOT EXISTS length_cm numeric,
  ADD COLUMN IF NOT EXISTS digital_url text,
  ADD COLUMN IF NOT EXISTS access_duration_days integer,
  ADD COLUMN IF NOT EXISTS service_duration_minutes integer,
  ADD COLUMN IF NOT EXISTS service_location text,
  ADD COLUMN IF NOT EXISTS warranty text,
  ADD COLUMN IF NOT EXISTS notes text;
