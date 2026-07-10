# Módulo de Suporte Premium (Help Desk)

O escopo pedido é enorme (SLA, IA, base de conhecimento, gravação de tela, integrações, relatórios, painel admin completo, avaliação NPS etc.). Para entregar valor rápido sem quebrar nada, proponho dividir em fases. Já temos hoje:

- Tabelas `support_tickets` e `support_messages`
- Página cliente `/support` (lista + chat simples)
- Página master `/master/support` (atende os tickets + contatos de suporte)

## Fase 1 — Rebuild Premium do essencial (agora)

Reescrever `src/routes/_authenticated/support.tsx` com:

1. **Dashboard topo** (glassmorphism, animado)
   - Boas-vindas com nome do usuário
   - KPIs: Abertos, Em andamento, Aguardando cliente, Resolvidos, Fechados
   - Tempo médio de resposta e resolução (calculados de `support_messages`)
   - Status do sistema (badge)
2. **Botão destacado "+ Abrir Novo Chamado"** abre modal premium com:
   - Categoria (dropdown com as 14 opções pedidas)
   - Prioridade (Baixa/Normal/Alta/Urgente coloridas)
   - Título, Descrição (textarea grande)
   - Ambiente, Navegador (auto-detectado, editável)
   - URL da tela (auto-preenchida), data/hora (auto)
   - Anexos (drag & drop → bucket `agent-media/support/`, preview, tamanho, progress)
   - Checkbox de consentimento
3. **Tela do ticket** (drawer/full page)
   - Cabeçalho com número (#000001), título, categoria, prioridade, status, datas, tempo em aberto
   - Timeline/chat em tempo real (Realtime em `support_messages`)
   - Envio de texto, arquivos, imagens, áudio (reaproveita gravador do `/messages`), emojis
   - Anexos com preview
   - Ao resolver: modal de avaliação ⭐ 1-5 + comentário (salvo em `support_tickets`)
4. **Histórico**
   - Lista com filtros (status, prioridade, categoria, busca por número/título)
   - Ordenação, badges coloridas, reabrir ticket
5. **Notificações in-app** via tabela `notifications` já existente quando o suporte responder / status mudar.

### Migração leve (aditiva, sem quebrar dados)

`support_tickets` ganha: `category`, `priority`, `environment`, `browser`, `page_url`, `attachments jsonb`, `rating int`, `rating_comment`, `resolved_at`, `closed_at`, `first_response_at`.
`support_messages` ganha: `attachments jsonb`, `reply_to_id`.

Realtime já ligado no projeto — adicionar publicação se necessário.

## Fase 2 (depois de você aprovar Fase 1)
- Área admin premium em `/master/support` com filtros avançados, atribuição, respostas prontas, etiquetas, mesclar tickets, exportar CSV/PDF
- Relatórios com gráficos (Recharts): tickets/dia, por categoria, tempo médio, top clientes, avaliações
- SLA com contagem regressiva e destaque vermelho
- Base de Conhecimento (nova tabela `kb_articles`, busca, sugestões antes de abrir ticket)

## Fase 3 (opcionais avançados)
- IA sugerindo solução antes de abrir ticket (Lovable AI, já configurado)
- Gravação de tela (`getDisplayMedia`) + screenshot (`html2canvas`)
- Notificações por e-mail/WhatsApp/Push
- Integrações Telegram/Webhook/CRM

---

**Confirma seguir só a Fase 1 agora?** Se sim, entrego o rebuild completo do `/support` do cliente (dashboard + modal premium + ticket com chat em tempo real + avaliação + histórico com filtros) numa entrega só. Fases 2 e 3 a gente faz depois, uma por vez, pra não virar bagunça.
