-- 1. Identify and Clean up global columns (where producer_id IS NULL)
-- We will keep the default ones but rename them to the original requested names.
-- First, let's reset the sort orders and names for the global columns.

-- Update existing columns to match the "original" flow
UPDATE kanban_columns SET name = 'Serviço a Fazer', sort_order = 10, is_default = true, is_done = false WHERE producer_id IS NULL AND sort_order = 10;
UPDATE kanban_columns SET name = 'Em Produção', sort_order = 20, is_default = false, is_done = false WHERE producer_id IS NULL AND sort_order = 20;
UPDATE kanban_columns SET name = 'Serviço Pronto', sort_order = 30, is_default = false, is_done = false WHERE producer_id IS NULL AND sort_order = 30;
UPDATE kanban_columns SET name = 'Alteração a Fazer', sort_order = 40, is_default = false, is_done = false WHERE producer_id IS NULL AND sort_order = 40;

-- If some columns were renamed to things like "PAMELA VIDEO EDITAR" at specific slots, we fix those too.
UPDATE kanban_columns SET name = 'Alteração', sort_order = 50, is_default = false, is_done = false, color = '#f59e0b' WHERE producer_id IS NULL AND (sort_order = 50 OR name = 'PAMELA VIDEO EDITAR');
UPDATE kanban_columns SET name = 'Alteração Pronta', sort_order = 60, is_default = false, is_done = false WHERE producer_id IS NULL AND sort_order = 60;
UPDATE kanban_columns SET name = 'Serviços Entregues', sort_order = 70, is_default = false, is_done = true WHERE producer_id IS NULL AND sort_order = 70;

-- Ensure "Serviço Pronto" exists if it was missing
INSERT INTO kanban_columns (name, sort_order, is_default, is_done, color)
SELECT 'Serviço Pronto', 30, false, false, '#22c55e'
WHERE NOT EXISTS (SELECT 1 FROM kanban_columns WHERE producer_id IS NULL AND sort_order = 30);

-- Ensure "Alteração a Fazer" exists
INSERT INTO kanban_columns (name, sort_order, is_default, is_done, color)
SELECT 'Alteração a Fazer', 40, false, false, '#ef4444'
WHERE NOT EXISTS (SELECT 1 FROM kanban_columns WHERE producer_id IS NULL AND sort_order = 40);

-- Ensure "Alteração" exists
INSERT INTO kanban_columns (name, sort_order, is_default, is_done, color)
SELECT 'Alteração', 50, false, false, '#f59e0b'
WHERE NOT EXISTS (SELECT 1 FROM kanban_columns WHERE producer_id IS NULL AND sort_order = 50);

-- Ensure "Alteração Pronta" exists
INSERT INTO kanban_columns (name, sort_order, is_default, is_done, color)
SELECT 'Alteração Pronta', 60, false, false, '#3b82f6'
WHERE NOT EXISTS (SELECT 1 FROM kanban_columns WHERE producer_id IS NULL AND sort_order = 60);

-- Ensure "Serviços Entregues" exists
INSERT INTO kanban_columns (name, sort_order, is_default, is_done, color)
SELECT 'Serviços Entregues', 70, false, true, '#10b981'
WHERE NOT EXISTS (SELECT 1 FROM kanban_columns WHERE producer_id IS NULL AND sort_order = 70);

-- Remove any other global columns that don't belong to the standard set
DELETE FROM kanban_columns WHERE producer_id IS NULL AND sort_order NOT IN (10, 20, 30, 40, 50, 60, 70);
