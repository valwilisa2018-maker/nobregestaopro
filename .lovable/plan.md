# Objetivo

Fazer as 10 seções do editor de agente pararem de ser só UI e serem honradas em runtime pelo webhook Evolution e pelo runner de follow-ups.

# Estado atual

- UI: 10 seções salvam em `agents.tools` (JSON) e em colunas dedicadas (`system_prompt`, `temperature`, `model`, `memory`, `is_active`).
- Backend (`/api/public/evolution.$instance.ts`): já respeita `system_prompt`, `temperature`, `model`, provider, memória (últimas N msgs), cota de plano e envia via Evolution.
- Backend (`/api/public/hooks/follow-ups.ts`): scaffold existe, mas não roda de fato os disparos.
- **Não respeitado hoje**: conversas (marca não-lida, msg única, cancelar em nova), tempo (delay por caractere, delay máx, espera, resposta padrão desconhecido, intervenção humana, reativação), alertas (WhatsApp/handoff), follow-up (agenda + mensagens + IA-generated), palavras-chave (allow/block/regex), horário (janela + almoço + dias + datas bloqueadas), áudio (STT de áudio recebido + TTS de resposta), mídia (envio condicional).

# Entregas (4 ondas)

## Onda 1 — Núcleo de comportamento (sem áudio/mídia)

Ajustar `evolution.$instance.ts` para aplicar antes de responder:

1. **Palavras-chave** (`ext.keywords`): modos `allow` (só responde se casar), `block` (ignora se casar), `regex`. Se bloquear → registra em `logs` e retorna 200 sem responder.
2. **Horário** (`ext.hours`): checa dia da semana, janela `start`–`end`, pausa almoço, `blockedDates`. Fora do horário → mensagem padrão configurável ou silêncio.
3. **Tempo** (`ext.timing`): `wait` (debounce por conversa via `conversations.metadata.pending_until`), `delayChar` + `delayMax` (delay artificial antes do envio), `unknownMsg` como fallback quando IA não gera texto, `humanIntervention`/`reactivation` (marca conversa em pausa quando operador humano manda mensagem outbound).
4. **Conversas** (`ext.conversation`): `keepUnread` (não zera `unread_count`), `singleMessage` (concatena múltiplas mensagens curtas dentro da janela `wait` numa só resposta), `cancelOnNew` (descarta job pendente se nova msg entrar), `stopAfterManual` (pausa agente se humano respondeu).
5. **Alertas** (`ext.alerts`): quando handoff detectado ou erro grave, envia mensagem via Evolution para número admin definido em `profiles.alert_phone` (nova coluna) e grava `billing_events`/`logs`.

Persistência mínima adicionada: `conversations.metadata` (jsonb) para `pending_until`, `pending_texts[]`, `agent_paused_until`, `last_manual_at`. Nova coluna `profiles.alert_phone`.

## Onda 2 — Follow-up real

Reescrever `/api/public/hooks/follow-ups.ts` (cron pg_cron a cada 5 min via `pg_net`):

- Para cada conversa com `last_message_at` > `checkMin` minutos e `follow_up_step` < `count`:
  - Se `respectHours` → aplica `ext.hours`.
  - Se `aiGenerated` → chama Lovable AI com histórico para gerar próxima abordagem; senão pega `messages[step]`.
  - Envia via Evolution, incrementa `follow_up_step`, agenda próximo `next_follow_up_at = now + intervalHrs`.
- Novas colunas em `conversations`: `follow_up_step int`, `next_follow_up_at timestamptz`, `follow_up_paused bool`.
- Job `pg_cron` chamando o endpoint com `apikey` (anon).

## Onda 3 — Áudio com IA (ElevenLabs)

- Solicitar conexão do connector **ElevenLabs** (sem pedir chave manual).
- Webhook Evolution: quando mensagem recebida for áudio (`type = "audioMessage"`), baixa o media, envia para `openai/gpt-4o-mini-transcribe` via Lovable AI e usa o transcript como input.
- Resposta: se `ext.audio.enabled` e (`ext.audio.mirrorFormat` && input foi áudio) ou (`ext.audio.smartAudio` && resposta > `smartAudioChars`) → gera TTS via ElevenLabs `eleven_turbo_v2_5`, faz upload no bucket `agent-audio` e envia pelo Evolution como `audio`. Caso contrário, texto normal.
- `ext.audio.replaceText`, `autoReply`, `asTool` respeitados.

## Onda 4 — Mídia com IA

- Novo bucket `agent-media` (Storage) + migração.
- Cada item em `ext.media.items[]` guarda `storage_path`, `mode` (`keyword`|`ai-decide`|`always`), `keywords`, `description`.
- No webhook: se `mode=keyword` e casar, envia via Evolution como `image`/`video`/`document`. Se `mode=ai-decide`, passamos as `description` como ferramentas para a IA escolher via tool-call.
- Upload feito pela UI (`MediaSection` ganha input de arquivo real).

# Detalhes técnicos

- Sem custom shared-secret: cron chama endpoint público com `apikey: <anon>`.
- Todo estado por-conversa vai em `conversations.metadata` (jsonb) para evitar corridas de coluna.
- Delay artificial usa `setTimeout` dentro do handler (Worker aguenta até ~30s; máximo `delayMax` capado em 25s).
- Debounce `wait` reusa `pending_until`: mensagens que chegam antes só empilham em `pending_texts`; a última dispara o processamento.
- Alertas: reutiliza a mesma `connection_id` do agente para enviar ao `alert_phone`.
- Auditoria: cada decisão (bloqueio por palavra, fora de horário, follow-up disparado, TTS gerado) escreve em `logs` para o dashboard de conversas já existente.

# Ordem de execução

1. Migração: colunas novas (`conversations.metadata`, `follow_up_*`, `profiles.alert_phone`) + buckets.
2. Onda 1 no `evolution.$instance.ts`.
3. Onda 2 + cron.
4. Onda 3 (ElevenLabs).
5. Onda 4 (mídia).

Cada onda termina com verificação pelos logs (`supabase--edge_function_logs` equivalente / `logs` table + preview).

Vou pedir confirmação antes de rodar a migração de cada onda; as edições de código dentro da onda saem em lote.