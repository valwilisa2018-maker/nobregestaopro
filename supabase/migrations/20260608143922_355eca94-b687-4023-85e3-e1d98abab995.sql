CREATE TYPE public.log_level AS ENUM ('INFO', 'WARN', 'ERROR', 'CRITICAL');

CREATE TABLE public.system_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    level public.log_level NOT NULL DEFAULT 'INFO',
    message TEXT NOT NULL,
    details JSONB,
    context TEXT, -- e.g., 'auth', 'kanban', 'backend'
    user_id UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Permissões
GRANT SELECT, INSERT ON public.system_logs TO authenticated;
GRANT ALL ON public.system_logs TO service_role;

-- RLS
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- Política: Usuários podem inserir seus próprios logs (ou anônimos se necessário, mas aqui vamos focar em autenticados para segurança)
CREATE POLICY "Users can insert logs" ON public.system_logs
    FOR INSERT WITH CHECK (true);

-- Política: Apenas administradores (service_role) podem ver todos os logs. 
-- Nota: Se quiser que um admin veja via UI, precisará de uma regra baseada em role ou email.
-- Por enquanto, vamos permitir que usuários autenticados vejam apenas logs de ERROR/CRITICAL se quisermos alerts na UI, 
-- ou apenas manter no DB para auditoria.
CREATE POLICY "Admins can view all logs" ON public.system_logs
    FOR SELECT USING (auth.role() = 'service_role');
