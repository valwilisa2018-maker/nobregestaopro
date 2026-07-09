# Plano — Flows v2 (Editor + Motor + Debug + Simulador)

O projeto já tem `flows`, `flow_runner.server.ts`, editor em `/flows` e webhook em `evolution.$instance.ts`. Vou refatorar em cima do que existe (sem quebrar fluxos atuais), consolidando estado, corrigindo o bug de travar após a 1ª resposta e adicionando debug + simulador.

## 1. Schema (migration)

Nova tabela `flow_executions` para persistir estado (hoje o estado fica só em `conversations.flow_state`, o que dificulta debug/replays):

- `flow_id`, `conversation_id`, `contact_id`, `connection_id`, `user_id`
- `status`: `waiting_user_input | processing | completed | failed | aborted`
- `current_block_id`, `awaiting_variable` (text)
- `variables` (jsonb), `last_error` (text)
- `started_at`, `updated_at`, `completed_at`
- Índices: `(conversation_id, status)`, `(user_id, status)`

Nova tabela `flow_execution_logs` (append-only, para painel de Debug e Realtime):
- `execution_id`, `level` (info|warn|error), `event` (block_enter|block_exit|var_set|condition|wait|resume|error|complete), `block_id`, `message`, `data` jsonb, `duration_ms`, `created_at`
- Índice `(execution_id, created_at)`
- `ALTER PUBLICATION supabase_realtime ADD TABLE ...` para stream ao vivo

RLS por `user_id` + GRANT `authenticated`/`service_role`. Nada para `anon`.

## 2. Motor de execução (`src/lib/flow-engine.server.ts`)

Reescrever `flow_runner.server.ts` como máquina de estados pura, chamada pelo webhook e pelo simulador:

- `startExecution({ flowId, conversationId, contactId })` → cria row, roda até bater num bloco de espera (Pergunta) ou fim.
- `resumeExecution({ executionId | conversationId, userInput })` → carrega estado, valida `status === waiting_user_input`, marca `processing`, salva resposta na variável (`awaiting_variable`), avalia condições, avança até novo `wait` ou `completed`. **Loop `while` explícito**, corrigindo o bug atual em que só um bloco roda por resposta.
- Blocos suportados: `message`, `question`, `condition` (IF/ELSE, regex, IA via Lovable AI), `action` (set var, http, tag contato, mover pipeline).
- Sandbox de variáveis: sistema (`contact.name`, `contact.phone`) + custom (definidas em blocos Pergunta) — interpolação `{{var}}` em mensagens.
- Validação pré-execução (`validateFlow(nodes,edges)`): IDs vazios, arestas órfãs, nós inalcançáveis, ciclos sem condição de saída, blocos Pergunta sem `variable`. Executor recusa fluxo inválido e loga o motivo.
- Cada transição escreve em `flow_execution_logs` (para debug/tempo real).

## 3. Webhook (`routes/api/public/evolution.$instance.ts`)

Substituir a chamada atual a `runFlow` por:
1. `resumeExecution` se existe execução `waiting_user_input` para aquela conversa.
2. Senão, se conexão tem fluxo ativo padrão / gatilho casa → `startExecution`.
3. Envio de mensagens outbound continua via `sendChatText/Media`.

Respeitar `flow_timeout_hours` da conexão (abandono).

## 4. Editor visual (`/flows`)

Editor atual é lista de blocos — trocar por canvas React Flow (`@xyflow/react` já é padrão do stack):

- Canvas com drag/drop, arestas tipadas (default / true / false / n-ways para condição).
- Paleta lateral esquerda: Mensagem, Pergunta, Condição, Ação.
- Painel direito (contextual ao bloco selecionado): campos do bloco + seletor de variáveis (autocomplete das existentes + criar nova).
- Botão **Validar** roda `validateFlow` e destaca nós/arestas com erro.
- Tema escuro, tokens do design system (sem cores hardcoded).

## 5. Debug + Simulador (aba na página do fluxo)

Layout split:
- **Simulador** (esquerda): campo de mensagem, botões rápidos, escolha do "contato fake". Chama server fn `simulateFlow` que roda o motor com `conversation_id` sintético e sem enviar WhatsApp.
- **Debug** (direita): stream de `flow_execution_logs` via Realtime, agrupado por bloco, com timing, variáveis atuais, último erro. Highlight do nó ativo no canvas.

Teste de aceitação incluído: fluxo com 50 blocos + mídia roda até o fim reagindo a múltiplas respostas.

## 6. Detalhes técnicos

- Server fns novas em `src/lib/flows-engine.functions.ts`: `simulateFlow`, `resumeSimulation`, `validateFlowDefinition`, `listExecutions`, `getExecutionLogs`.
- Todas com `requireSupabaseAuth`.
- `supabaseAdmin` só dentro do webhook (import dinâmico), nunca no módulo.
- IA das condições via Lovable AI Gateway (`google/gemini-2.5-flash`), sem chave do usuário.
- Realtime: canal `flow_execution_logs:execution_id=eq.<id>` montado em `useEffect` com cleanup.
- Migração de dados: fluxos existentes continuam funcionando; `flow_state` em `conversations` vira fallback read-only até primeira execução nova.

## Entregáveis

1. Migration (`flow_executions`, `flow_execution_logs`, realtime, RLS, grants).
2. `src/lib/flow-engine.server.ts` + `flows-engine.functions.ts` (novo motor + server fns).
3. Webhook `evolution.$instance.ts` usando o novo motor.
4. `/flows` refatorado com canvas React Flow + painel de variáveis.
5. `/flow-debug` (ou aba) com simulador + logs em tempo real.
6. Remover `flow_runner.server.ts` antigo depois que tudo migrar.

Confirma que posso seguir? Se quiser, corto escopo (ex.: manter editor atual e entregar só motor+debug+simulador primeiro).
