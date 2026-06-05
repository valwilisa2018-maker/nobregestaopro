CREATE TYPE public.announcement_type AS ENUM ('info', 'warning', 'maintenance', 'update');

CREATE TABLE public.system_announcements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    type public.announcement_type NOT NULL DEFAULT 'info',
    is_active BOOLEAN NOT NULL DEFAULT true,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id)
);

GRANT SELECT ON public.system_announcements TO authenticated;
GRANT SELECT ON public.system_announcements TO anon;
GRANT ALL ON public.system_announcements TO service_role;

ALTER TABLE public.system_announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active announcements" ON public.system_announcements
    FOR SELECT USING (is_active = true AND (expires_at IS NULL OR expires_at > now()));

CREATE POLICY "Admins can manage announcements" ON public.system_announcements
    FOR ALL USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_announcements_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_system_announcements_updated_at 
    BEFORE UPDATE ON public.system_announcements 
    FOR EACH ROW EXECUTE FUNCTION public.update_announcements_updated_at();