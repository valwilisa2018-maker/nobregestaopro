-- Enum de eventos pontuáveis
CREATE TYPE public.om_evento AS ENUM ('pronto', 'alteracao', 'entregue', 'distribuicao_edicao');

-- Pontos configuráveis por evento (linha única por evento)
CREATE TABLE public.om_scoring (
  evento public.om_evento PRIMARY KEY,
  pontos INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.om_scoring TO authenticated;
GRANT ALL ON public.om_scoring TO service_role;
ALTER TABLE public.om_scoring ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos autenticados leem pontuação"
  ON public.om_scoring FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins gerenciam pontuação"
  ON public.om_scoring FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER om_scoring_updated_at
  BEFORE UPDATE ON public.om_scoring
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Seed inicial: 0 pontos (admin configura)
INSERT INTO public.om_scoring (evento, pontos) VALUES
  ('pronto', 0), ('alteracao', 0), ('entregue', 0), ('distribuicao_edicao', 0);

-- Mapeamento: lista do Trello -> evento
CREATE TABLE public.om_trello_list_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id TEXT NOT NULL UNIQUE,
  list_name TEXT NOT NULL,
  evento public.om_evento NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.om_trello_list_map TO authenticated;
GRANT ALL ON public.om_trello_list_map TO service_role;
ALTER TABLE public.om_trello_list_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem mapa lista"
  ON public.om_trello_list_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam mapa lista"
  ON public.om_trello_list_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER om_trello_list_map_updated_at
  BEFORE UPDATE ON public.om_trello_list_map
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Mapeamento: membro do Trello -> produtor
CREATE TABLE public.om_trello_member_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trello_member_id TEXT NOT NULL UNIQUE,
  trello_username TEXT,
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.om_trello_member_map TO authenticated;
GRANT ALL ON public.om_trello_member_map TO service_role;
ALTER TABLE public.om_trello_member_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Todos leem mapa membro"
  ON public.om_trello_member_map FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam mapa membro"
  ON public.om_trello_member_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER om_trello_member_map_updated_at
  BEFORE UPDATE ON public.om_trello_member_map
  FOR EACH ROW EXECUTE FUNCTION public.tg_updated_at();

-- Eventos pontuados (registro real de movimentação)
-- card_key = lower(trim(nome do card)) — usado para impedir duplicidade
CREATE TABLE public.om_eventos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id UUID NOT NULL REFERENCES public.producers(id) ON DELETE CASCADE,
  evento public.om_evento NOT NULL,
  card_key TEXT NOT NULL,
  card_name TEXT NOT NULL,
  trello_card_id TEXT,
  pontos INTEGER NOT NULL DEFAULT 0,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  raw JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (producer_id, evento, card_key)
);

CREATE INDEX om_eventos_producer_idx ON public.om_eventos(producer_id, occurred_at DESC);
CREATE INDEX om_eventos_occurred_idx ON public.om_eventos(occurred_at DESC);

GRANT SELECT ON public.om_eventos TO authenticated;
GRANT ALL ON public.om_eventos TO service_role;
ALTER TABLE public.om_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Autenticados leem eventos"
  ON public.om_eventos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admins gerenciam eventos"
  ON public.om_eventos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Segredo do webhook do Trello (assinatura)
ALTER TABLE public.om_settings ADD COLUMN IF NOT EXISTS trello_webhook_secret TEXT;