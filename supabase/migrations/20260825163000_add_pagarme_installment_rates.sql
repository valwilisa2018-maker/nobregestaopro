CREATE TABLE IF NOT EXISTS public.pagarme_installment_rates (
  installments smallint PRIMARY KEY CHECK (installments BETWEEN 1 AND 12),
  fee_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (fee_percent >= 0 AND fee_percent < 100),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

INSERT INTO public.pagarme_installment_rates (installments, fee_percent)
VALUES
  (1, 5.59),
  (2, 8.59),
  (3, 9.84),
  (4, 11.09),
  (5, 12.34),
  (6, 13.59),
  (7, 15.34),
  (8, 16.59),
  (9, 17.84),
  (10, 19.09),
  (11, 20.34),
  (12, 21.59)
ON CONFLICT (installments) DO NOTHING;

GRANT SELECT ON public.pagarme_installment_rates TO authenticated;
GRANT INSERT, UPDATE ON public.pagarme_installment_rates TO authenticated;
GRANT ALL ON public.pagarme_installment_rates TO service_role;

ALTER TABLE public.pagarme_installment_rates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read Pagarme installment rates"
  ON public.pagarme_installment_rates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins insert Pagarme installment rates"
  ON public.pagarme_installment_rates FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins update Pagarme installment rates"
  ON public.pagarme_installment_rates FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
