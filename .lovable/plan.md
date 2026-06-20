## Objetivo

Deixar a página **Operação e Meta** simples, exata e centrada no produtor — todas as contagens vindas do **Kanban de produção** (mesma fonte do Dashboard), com mês cheio (do dia 1 até hoje) e destaque visual para quem bate a meta.

## O que muda

### 1. Fonte única e exata (Kanban)
- Toda contagem (vídeos prontos, em produção, alterações, minutagem) passa a vir de `service_orders` + `kanban_columns`, igual à correção feita no Dashboard:
  - **Pronto** = card hoje numa coluna `is_done = true`.
  - **Em produção** = card hoje numa coluna `is_done = false`.
  - **Alterações** = `redo_count` somado (sem usar a comparação `updated_at != delivered_at`, que estava divergindo entre abas).
  - **Minutagem** = extraída do título do card (mesmo parser do webhook do Trello: `2:30`, `1min30s`, `150s` etc.).
- Filtro de período padrão: **mês corrente, do dia 1 até hoje** (com seletor para “mês anterior” e “personalizado”).

### 2. Meta por produtor (acaba o “meta = 100” fixo)
- Passa a usar `producers.daily_points_goal` (ou o fallback `om_settings.base_daily_goal`) × dias úteis transcorridos do mês para a barra de progresso individual.
- **Bateu a meta no mês** → card com borda dourada, badge “🏆 Meta batida” e nome destacado.
- **Bateu a meta do dia** → selo verde discreto.

### 3. Consolidar as abas (de 7 para 4)

```text
Antes:  Diária | Mensal | Dinâmica | Tendências | Produtores | Conquistas | Relatórios
Depois: Visão Geral | Produtores | Tendências | Relatórios
```

- **Visão Geral** — junta o que era *Diária* + *Mensal* + *Dinâmica*: KPIs do dia, KPIs do mês, ranking do mês, meta coletiva da equipe e quem bateu a meta hoje.
- **Produtores** — um card por produtor com: nome, foto, **vídeos prontos no mês**, **em produção agora**, **minutagem total entregue**, **alterações**, barra de progresso vs meta individual, destaque se bateu a meta.
- **Tendências** — gráficos de 30 dias e projeção do mês (corrigida para usar dias úteis, não calendário).
- **Relatórios** — geração de texto para WhatsApp/print, agora batendo com os números das outras abas.
- *Conquistas* vira uma seção dentro de **Produtores** (badges ao clicar no card), eliminando ranking duplicado.
- *Configurações* continua acessível pelo botão de admin, sem mudança.

### 4. Pequenos ajustes de UX
- Cabeçalho da página mostra: **período ativo**, **total de vídeos prontos**, **total de minutagem**, **% da meta da equipe**.
- Cores e ícones consistentes: 🟢 pronto, 🟡 em produção, 🔁 alteração, ⏱ minutagem.

## Detalhes técnicos

- `src/components/operacao-meta/shared.tsx`
  - `useOmData`: adicionar `title` em `service_orders` para extrair minutagem; adicionar join de `kanban_columns.is_done`.
  - Novo helper `parseDuracaoSegundos` / `formatDuracao` (reaproveitar o que já está no `dashboard.tsx` — mover para `src/lib/format.ts`).
  - Padronizar contadores num único helper `computeProducerStats(producer, orders, scope)` consumido por todas as abas.
  - Padronizar `alteracoes = sum(redo_count)`.
  - Remover `const meta = 100`; usar `daily_points_goal × workingDaysElapsed`.
- `src/routes/_authenticated/operacao-meta.tsx`
  - Reduzir tabs para 4 (Visão Geral, Produtores, Tendências, Relatórios).
  - Adicionar barra de período (Mês atual / Mês anterior / Personalizado) com estado em URL (`?periodo=...`).
- Arquivos a remover (substituídos pela Visão Geral): `operacao-meta.diaria.tsx`, `operacao-meta.mensal.tsx`, `operacao-meta.dinamica.tsx`, `operacao-meta.conquistas.tsx` (vira seção dentro de Produtores). Criar `operacao-meta.visao-geral.tsx`.
- Sem mudança de schema, sem migration.

## Fora do escopo

- Reconciliar `om_eventos` (Trello) com `service_orders`. O Kanban é a fonte da verdade; `om_eventos` continua sendo só auditoria do webhook.
- Mudanças nas configurações de scoring/Trello.
