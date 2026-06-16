ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS google_drive_link text;
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS platform_link text;
ALTER TABLE public.project_folders ADD COLUMN IF NOT EXISTS platform_link text;