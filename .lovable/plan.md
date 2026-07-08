# Módulo Pipeline CRM (Kanban)

Módulo completo de CRM em Kanban para o cliente, acessível em `/pipeline`, com 13 etapas padrão, cartões ricos, drag & drop, filtros, busca, automações básicas e mini-dashboard. Entrega em fases para não estourar o escopo.

## Fase 1 — Base funcional (esta rodada)

### Banco (1 migração)
- `pipeline_stages` — etapas (nome, cor, ordem, `is_system`, `user_id`). Seed automático das 13 etapas ao 1º acesso via RPC `ensure_default_pipeline_stages()`.
- `pipeline_deals` — cartões: `stage_id`, `contact_id?`, `client_id?`, `title`, `company`, `phone`, `whatsapp`, `email`, `value_cents`, `product`, `source`, `owner_id`, `priority` (low/med/high/urgent), `tags text[]`, `notes`, `next_contact_at`, `last_interaction_at`, `links jsonb` (conversa/proposta/contrato/drive/pagamento), `lost_reason`, `position`, `user_id`.
- `pipeline_activities` — histórico de movimentação/eventos por deal (`deal_id`, `type`, `from_stage`, `to_stage`, `payload jsonb`).
- `pipeline_attachments` — arquivos (`deal_id`, `name`, `url`, `mime`, `size`).
- RLS: dono (`user_id = auth.uid()`) full, master full. GRANT SELECT/INSERT/UPDATE/DELETE p/ authenticated; ALL p/ service_role.
- Trigger: ao inserir/alterar `stage_id`, registrar em `pipeline_activities` e atualizar `last_interaction_at`.

### Rotas / UI
- `src/routes/_authenticated/pipeline.tsx` — tela Kanban.
- Item "Pipeline" no `AppSidebar` (grupo Vendas/CRM).
- Componentes em `src/components/pipeline/`:
  - `kanban-board.tsx` — colunas com scroll horizontal, cores por etapa, contador e soma de valores.
  - `deal-card.tsx` — avatar, nome, empresa, valor formatado, badges de prioridade e tags, próximo contato.
  - `deal-drawer.tsx` — edição completa do cartão (todos os campos, links, anexos, histórico, checklist por etapa).
  - `pipeline-filters.tsx` — busca + filtros (responsável, produto, origem, prioridade, tags, valor, data).
  - `pipeline-stats.tsx` — cards no topo (leads, em andamento, ganhos, perdidos, taxa conversão, ticket médio, receita prevista/realizada).
- Drag & drop: `@dnd-kit/core` + `@dnd-kit/sortable` (já leve, sem dependências pesadas).
- Design: glassmorphism sutil usando tokens (`bg-card/60 backdrop-blur`), sombras, animações com classes existentes; cores das etapas via HSL nos tokens semânticos.

### Automação básica (Fase 1)
- Ao arrastar → update `stage_id` + registro em `pipeline_activities` (via trigger).
- Ao entrar em "Follow-up" sem `next_contact_at` → seta +2 dias.
- Ao entrar em "Perdido" → exige `lost_reason` no drawer.

## Fase 2 — Automação avançada (próxima rodada, se aprovado)
- Disparo de WhatsApp/e-mail por etapa (usar `broadcasts`/`quick_sends` existentes).
- Tarefas automáticas por etapa + integração com `calendar`.
- Geração de proposta/contrato (template).
- Realtime (`supabase.channel`) para movimentações ao vivo.
- Pipelines personalizados (múltiplos boards por usuário).

## Fase 3 — Dashboard dedicado
- Página `/pipeline/insights`: ranking vendedores, conversão por origem, tempo médio por etapa, meta do mês, gráficos (Recharts já instalado).

## Detalhes técnicos
- Sem novas dependências além de `@dnd-kit/core` e `@dnd-kit/sortable`.
- Queries via `supabase-js` direto (padrão do projeto), sem server functions novas.
- Formatação de moeda em BRL, datas em pt-BR (`date-fns`).
- Mobile: colunas em scroll horizontal + card tap abre drawer full-screen.

## O que NÃO entra na Fase 1
- Envio real de WhatsApp/e-mail automático por etapa.
- Geração automática de PDF de proposta/contrato.
- Realtime multi-usuário.
- Pipelines customizados (só o padrão de 13 etapas).

Confirma seguir com a **Fase 1** exatamente assim?