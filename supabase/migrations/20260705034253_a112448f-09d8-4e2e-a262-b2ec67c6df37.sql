ALTER TABLE public.agents
  DROP COLUMN IF EXISTS ai_provider_id,
  DROP COLUMN IF EXISTS model,
  DROP COLUMN IF EXISTS category;