
-- Backfill sale_id em project_folders a partir dos links já existentes em sales
WITH matches AS (
  SELECT
    pf.id AS folder_id,
    s.id  AS sale_id
  FROM public.project_folders pf
  JOIN public.sales s
    ON (
      COALESCE(s.google_drive_link, '') ILIKE '%/pastas-arquivos/' || pf.id::text || '%'
      OR COALESCE(s.platform_link, '')  ILIKE '%/pastas-arquivos/' || pf.id::text || '%'
      OR COALESCE(s.trello_link, '')    ILIKE '%/pastas-arquivos/' || pf.id::text || '%'
    )
  WHERE pf.sale_id IS NULL
)
UPDATE public.project_folders pf
SET sale_id = m.sale_id
FROM matches m
WHERE pf.id = m.folder_id;

-- Backfill kanban_card_id em project_folders a partir dos links em service_orders
WITH matches AS (
  SELECT
    pf.id AS folder_id,
    so.id AS card_id,
    so.sale_id AS card_sale_id
  FROM public.project_folders pf
  JOIN public.service_orders so
    ON COALESCE(so.trello_link, '') ILIKE '%/pastas-arquivos/' || pf.id::text || '%'
  WHERE pf.kanban_card_id IS NULL
)
UPDATE public.project_folders pf
SET
  kanban_card_id = m.card_id,
  sale_id = COALESCE(pf.sale_id, m.card_sale_id)
FROM matches m
WHERE pf.id = m.folder_id;
