CREATE TABLE public.sale_receipts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  paid_at DATE NOT NULL DEFAULT CURRENT_DATE,
  uploaded_by UUID,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sale_receipts TO authenticated;
GRANT ALL ON public.sale_receipts TO service_role;

ALTER TABLE public.sale_receipts ENABLE ROW LEVEL SECURITY;

CREATE POLICY sale_receipts_read ON public.sale_receipts FOR SELECT TO authenticated USING (true);

CREATE POLICY sale_receipts_write ON public.sale_receipts FOR ALL TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'vendedor'::app_role) OR has_role(auth.uid(), 'financeiro'::app_role));

CREATE INDEX idx_sale_receipts_sale_id ON public.sale_receipts(sale_id);