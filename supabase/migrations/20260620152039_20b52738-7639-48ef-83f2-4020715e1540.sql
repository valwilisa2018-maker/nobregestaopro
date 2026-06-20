ALTER TABLE public.service_orders
  ADD COLUMN IF NOT EXISTS google_drive_link text,
  ADD COLUMN IF NOT EXISTS platform_link text;

UPDATE public.service_orders so
SET google_drive_link = COALESCE(so.google_drive_link, so.trello_link, s.google_drive_link, s.trello_link)
FROM public.sales s
WHERE so.sale_id = s.id
  AND so.google_drive_link IS NULL;

UPDATE public.service_orders so
SET google_drive_link = COALESCE(so.google_drive_link, so.trello_link)
WHERE so.google_drive_link IS NULL
  AND so.trello_link IS NOT NULL;

UPDATE public.service_orders so
SET platform_link = COALESCE(so.platform_link, s.platform_link)
FROM public.sales s
WHERE so.sale_id = s.id
  AND so.platform_link IS NULL
  AND s.platform_link IS NOT NULL;