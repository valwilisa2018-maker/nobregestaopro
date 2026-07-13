# Módulo Sequências (Etapa 4 do Disparo)

Escopo enorme — proponho entregar em fases pra não quebrar nada. Hoje já existe `broadcasts` no modo `sequential` com `broadcast_steps` e o cron `/api/public/hooks/broadcasts` roda a cada minuto. Vou construir Sequências como um módulo próprio, integrado ao Workflow (`flows`), aproveitando esse cron.

## Fase 1 — Núcleo funcional (agora)

### Banco (migração)
- `sequences`: nome, descrição, status (active/paused/draft), flow padrão opcional, janela (window_start, window_end, weekdays[]), timezone, intervalo entre mensagens, política de reinscrição (skip/restart/continue/new_run), palavras-chave (text[]), match_mode (exact/contains), ignore_case, ignore_accents, data_inicio, data_fim, created_by user_id.
- `sequence_steps`: sequence_id, position, name, flow_id, delay_value, delay_unit (minute/hour/day/week/month), send_window (herda ou custom), max_retries, on_error (retry/skip/pause/remove/notify).
- `sequence_enrollments`: sequence_id, user_id, contact_id, phone, status (waiting/scheduled/running/paused/completed/cancelled/error/out_of_window), current_step, next_run_at, entry_source, entry_at, completed_at, last_error, retry_count.
- `sequence_events`: enrollment_id, step_id, type (scheduled/sent/error/skipped/paused/resumed/completed/keyword_enroll), message, data jsonb, created_at.
- GRANTs + RLS por `user_id`.

### Backend
- `src/lib/sequences.functions.ts`: CRUD sequências/etapas, inscrever/remover/pausar/retomar/pular/reenviar contato, duplicar sequência.
- `src/lib/sequences-runner.server.ts`: função que processa enrollments due, respeita janela+weekdays+intervalo, executa o `flow_id` da etapa via `runFlowTracked`, agenda `next_run_at` da próxima etapa (converte delay_unit → ms), registra em `sequence_events`. Se fora da janela → reagenda para próximo horário permitido.
- Extender `/api/public/hooks/broadcasts.ts` (ou criar `/api/public/hooks/sequences.ts` usando o mesmo `FOLLOWUP_TRIGGER_SECRET`) para chamar o runner. Reusar o cron existente que já bate a cada minuto.
- Ativação por palavra-chave: hook no webhook do Evolution (`/api/public/evolution.$instance.ts`) — se mensagem recebida bate keyword de sequência ativa do dono da instância, cria enrollment respeitando política de reinscrição.

### Frontend
- Nova aba **Sequências** dentro do `src/routes/_authenticated/broadcasts.tsx` (Etapa 4) OU rota nova `/_authenticated/sequences.tsx` acessada pelo card. Uso rota nova pra não inflar broadcasts.
- Tela lista: cards premium com nome, status pill, nº etapas, inscritos, em andamento, concluídos, taxa, próximo disparo. Ações: abrir, editar, pausar/ativar, duplicar, ver contatos, excluir.
- Editor visual: timeline vertical com cards de etapa arrastáveis (`@dnd-kit` já instalado), cada card mostra nº, nome, fluxo, delay, dias, horário, status; botão + entre etapas.
- Modal de etapa: nome, descrição, fluxo (select dos `flows` do usuário), delay (valor + unidade), janela herdada/custom, intervalo, on_error, max_retries.
- Painel do contato inscrito: histórico com timeline de eventos, próximo envio, ações (pausar/retomar/pular/mover/reiniciar/remover).
- Configuração da sequência: nome, descrição, status pill, período, forma de entrada (checkboxes), regras de reinscrição, janela + weekdays visuais, timezone, keywords com match_mode.

### Workflow — bloco de sequência (opcional Fase 1)
- Adicionar tipo de bloco `SEQUENCE_ENROLL` no runner de fluxos (`flow-runner.server.ts`) com ação inscrever/remover/pausar/retomar/pular. UI de edição do bloco no builder do Workflow.

## Fase 2 (depois de aprovar Fase 1)
- Relatórios completos com Recharts (inscritos, entregues, lidos, conversões, por etapa/fluxo/período, palavras-chave).
- Importação em massa e formulário público de inscrição.
- Ações avançadas: mover para etapa específica em lote, condições por etapa, ramificações.
- Notificação ao admin em erro (via `notifications` já existente).
- Tema claro/escuro (herda do projeto).

## Detalhes técnicos

```text
Runner (chamado a cada minuto pelo pg_cron via /api/public/hooks/sequences):

for enrollment in (status in scheduled/waiting AND next_run_at <= now AND sequence.status=active):
  s = sequence; step = steps[enrollment.current_step]
  if not inWindow(now, s.window, s.weekdays):
    next_run_at = nextAllowedSlot(now, s); continue
  if intervaloContatoRestante: continue
  try:
    runFlowTracked(step.flow_id, contact, ...)
    log(sent); enrollment.current_step += 1
    if last step: status=completed
    else: next_run_at = now + step.delay; status=scheduled
  except err:
    retry_count++; if retry_count < step.max_retries: agenda retry
    else: aplica step.on_error
```

Janela: `weekdays` (0-6) + `window_start`/`window_end`. Fora → arredonda para próximo dia permitido às `window_start`.

Palavras-chave: no webhook Evolution, após identificar user_id da conexão, normaliza texto (lowercase + strip accents se configurado), roda `ilike` / contains contra `sequences.keywords` ativas do dono, cria enrollment se passar na política.

Isolamento total por `user_id` — RLS `auth.uid() = user_id` em todas as tabelas.

## O que fica de fora nesta entrega
- Métricas de leitura/entrega/conversão (dependem de eventos do WhatsApp que hoje não capturamos completos).
- Fuso horário por sequência (usa timezone do servidor UTC; UI mostra local).
- Editor do bloco SEQUENCE_ENROLL no builder visual do Workflow — só o suporte no runner nesta fase, UI vem na Fase 2 se preferir.

Confirma seguir com a **Fase 1** desse jeito? Se sim, entrego migração + runner + rota `/sequences` com editor visual e ativação por palavra-chave numa entrega só.
