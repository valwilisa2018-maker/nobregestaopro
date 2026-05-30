
INSERT INTO public.invoices (sale_id, customer_id, amount, status, notes)
SELECT s.id, s.customer_id,
       COALESCE(s.total_amount,0) / GREATEST(COALESCE(s.service_quantity,1),1) * gs,
       'a_fazer', s.notes
FROM public.sales s
CROSS JOIN LATERAL generate_series(1, GREATEST(COALESCE(s.service_quantity,1),1)) AS gs
WHERE NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.sale_id = s.id)
  AND gs = 1;

INSERT INTO public.invoices (sale_id, customer_id, amount, status, notes)
SELECT s.id, s.customer_id,
       COALESCE(s.total_amount,0) / GREATEST(COALESCE(s.service_quantity,1),1),
       'a_fazer', s.notes
FROM public.sales s
CROSS JOIN LATERAL generate_series(2, GREATEST(COALESCE(s.service_quantity,1),1)) AS gs
WHERE (SELECT COUNT(*) FROM public.invoices i WHERE i.sale_id = s.id) < GREATEST(COALESCE(s.service_quantity,1),1);
