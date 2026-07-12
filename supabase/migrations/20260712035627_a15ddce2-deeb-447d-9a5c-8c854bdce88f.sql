
-- Reassign deals from duplicate stages (keep earliest by created_at, then id) to the kept stage per (user_id, name)
WITH ranked AS (
  SELECT id, user_id, name,
         row_number() OVER (PARTITION BY user_id, name ORDER BY created_at, id) AS rn,
         first_value(id) OVER (PARTITION BY user_id, name ORDER BY created_at, id) AS keep_id
  FROM public.pipeline_stages
)
UPDATE public.pipeline_deals d
SET stage_id = r.keep_id
FROM ranked r
WHERE d.stage_id = r.id AND r.rn > 1;

WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY user_id, name ORDER BY created_at, id) AS rn
  FROM public.pipeline_stages
)
DELETE FROM public.pipeline_stages s USING ranked r
WHERE s.id = r.id AND r.rn > 1;

-- Prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS pipeline_stages_user_name_uidx
  ON public.pipeline_stages (user_id, name);
