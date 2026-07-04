
ALTER TABLE public.plans
  ADD COLUMN IF NOT EXISTS price_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS tokens_included bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS features jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS highlight boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

GRANT SELECT ON public.plans TO anon;

DELETE FROM public.plans WHERE name IN ('Starter','Professional','Business','Enterprise');

INSERT INTO public.plans (name, price_cents, tokens_included, description, features, highlight, sort_order, daily_limit, monthly_limit) VALUES
('Starter', 9700, 5000000, 'Ideal para autônomos.',
  '["1 WhatsApp","1 Agente IA","500 atendimentos IA","CRM","Agenda","Follow-up","Workflows","Disparo em massa","Base de conhecimento"]'::jsonb,
  false, 1, 0, 500),
('Professional', 19700, 20000000, 'Mais vendido — para quem escala.',
  '["3 WhatsApps","5 Agentes IA","5.000 atendimentos IA","CRM ilimitado","Agenda","Workflows","Disparo","Base de conhecimento","Histórico completo","Prioridade na fila"]'::jsonb,
  true, 2, 0, 5000),
('Business', 39700, 60000000, 'Para empresas.',
  '["10 WhatsApps","20 Agentes IA","30.000 atendimentos","CRM completo","Múltiplos usuários","IA ilimitada (ou limite alto)","APIs","Webhooks","Automações ilimitadas","Suporte prioritário"]'::jsonb,
  false, 3, 0, 30000),
('Enterprise', 99700, 200000000, 'Para operações grandes.',
  '["WhatsApps ilimitados","Agentes ilimitados","Fluxos ilimitados","Usuários ilimitados","API completa","White Label (opcional)","Servidor dedicado (se desejar)","Suporte VIP","Gerente de sucesso"]'::jsonb,
  false, 4, 0, 0);
