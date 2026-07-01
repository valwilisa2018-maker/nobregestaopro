## Objetivo
Reconstruir a área `/agents` seguindo exatamente as 6 telas de referência: header com ícone, 4 abas grandes em pill, e um editor de agente com 10 seções colapsáveis (accordion).

## Estrutura de Abas (topo da página)
Pills grandes em grid de 4 colunas, aba ativa com fundo ciano/gradient e glow:
1. **Meus Agentes** — lista de cards + botão "Novo Agente" (empty state com robô e "Criar Primeiro Agente")
2. **Logs** — "Painel em Tempo Real" com: contador de Agentes, 4 cards de Conversas (Aguardando/Em Atendimento/Finalizadas/IA Ativa), Chaves de API (chips vermelhos quando inativas), 4 stats (Total Eventos/Sucesso/Erros/Tempo Médio), Feed de Atividade com filtros (Todos/Sucesso/Erros/Info)
3. **Provedores** — "Provedor WhatsApp": 2 cards selecionáveis (API Oficial Meta / Evolution API) + botão "Salvar Provedor"
4. **Chaves API** — inputs por provedor (Gemini, OpenAI, DeepSeek, xAI/Grok, ElevenLabs) com toggle "Mostrar" e "Salvar Chaves"

## Card do Agente (aba Meus Agentes)
- Nome + status dot verde
- Linhas: `⚡ Provider — model`, `≡ Temp: X | Max Tokens: Y`, `⏱ Timer: humanizado`
- Botão largo "Configurar Agente" (ciano bold)
- Ícones no canto: duplicar / excluir

## Editor de Agente (ao clicar Configurar)
Header: seta voltar, "Novo Agente", subtítulo `Gemini — gemini-2.5-flash`, toggle Ativo, botões "Restaurar" e "Salvar Tudo".

10 seções em accordion, cada uma com ícone ciano à esquerda:
1. **Configuração do Modelo** — Provedor, Modelo, Temperatura (slider Preciso→Criativo), Max Tokens, Memória da IA (slider 10↔100 msgs), Prompt do Sistema (textarea grande com "Restaurar Padrão" e "Biblioteca de Prompts"), botão Salvar
2. **Conversas** — regras de conversa
3. **Tempo e Mensagens** — delays, timers
4. **Alertas** — notificações
5. **Follow-Up** — sequências
6. **Ativação por Palavra-chave**
7. **Horário de Funcionamento**
8. **Áudio com IA**
9. **Mídia com IA**
10. **Testar IA** — playground

Cada seção começa colapsada; só a #1 aberta por padrão.

## Detalhes técnicos
- Nova estrutura: `src/components/agents/agents-tabs.tsx` (shell + tabs), `agents-list.tsx`, `agents-logs.tsx`, `agents-providers.tsx`, `agents-api-keys.tsx`, e reescrita de `agent-editor.tsx` para o layout de accordion.
- `src/routes/_authenticated/agents.tsx` renderiza o novo shell com tabs.
- Persistência: reaproveita tabela `agents`; cria/usa `ai_providers` para chaves API (já existe); provedor WhatsApp salvo em `user_settings` (novo campo `whatsapp_provider`) ou em coluna nova.
- Estilo: tabs em pill com `bg-primary text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/.5)]`, cards com border ciano sutil, ícones em quadrado ciano arredondado.
- Sem ícone de estrelinha (regra já ativa) — usar Bot, ScrollText, Smartphone, KeyRound, Sliders, MessageSquare, Clock, Bell, Send, Hash, CalendarClock, AudioLines, Image, PlayCircle.

## Fora de escopo (não muda agora)
- Lógica real dos campos 2–10 (só UI + persistência JSON no `agents` row).
- Integração real com Meta/Evolution além do que já existe.
