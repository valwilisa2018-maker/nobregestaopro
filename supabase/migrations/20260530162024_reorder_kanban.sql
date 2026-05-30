UPDATE public.kanban_columns SET sort_order = 10, is_default = true  WHERE name = 'Serviços a Fazer';
UPDATE public.kanban_columns SET sort_order = 20, is_default = false WHERE name = 'Produção';
UPDATE public.kanban_columns SET sort_order = 30 WHERE name = 'Alteração a Fazer';
UPDATE public.kanban_columns SET sort_order = 40 WHERE name = 'Alteração Pronta';
UPDATE public.kanban_columns SET sort_order = 50 WHERE name = 'Vídeos Prontos';
UPDATE public.kanban_columns SET sort_order = 60 WHERE name = 'Entregue';
