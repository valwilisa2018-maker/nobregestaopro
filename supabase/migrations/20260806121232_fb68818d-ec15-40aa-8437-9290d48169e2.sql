-- Separa dois clientes que estavam compartilhando o mesmo cadastro
-- (o documento "Vai passar" fez o sistema reaproveitar o cliente errado).
WITH novo AS (
  INSERT INTO public.customers (name, company, document, phone, email)
  VALUES ('Gisele Piva', 'Compacta Maquinas', NULL, '(35) 9715-3350', NULL)
  RETURNING id
)
UPDATE public.sales s
SET customer_id = (SELECT id FROM novo)
WHERE s.id = '2b638b02-58b9-4001-9d3d-93367a7be8c7';

UPDATE public.customers
SET name = 'Evandro', company = 'Grupo Evandro Monteiro', document = NULL
WHERE id = '86604a04-bd92-4a72-8e87-a302a9f36101';