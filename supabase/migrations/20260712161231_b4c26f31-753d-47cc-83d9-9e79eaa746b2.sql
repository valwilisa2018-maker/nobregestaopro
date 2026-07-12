ALTER TABLE public.sale_products
  ADD COLUMN IF NOT EXISTS seller_name text,
  ADD COLUMN IF NOT EXISTS product_type text;