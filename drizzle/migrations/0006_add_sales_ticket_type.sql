ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS ticket_type TEXT;
ALTER TABLE public.sales ADD CONSTRAINT sales_ticket_type_check CHECK (ticket_type IS NULL OR ticket_type IN ('high','low'));