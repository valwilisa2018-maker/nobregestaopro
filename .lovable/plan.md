# Painel Admin Master Completo

## 1. Banco de dados (nova migração)

Novas tabelas (todas com RLS master-only para escrita, usuário-dono para leitura própria):

- **announcements** — anúncios/recados globais criados pelo Master
  - campos: `title`, `body`, `severity` (info/warning/success), `cta_label`, `cta_url`, `starts_at`, `ends_at`, `is_active`, `created_by`
- **announcement_reads** — controle de "já vi" por usuário
  - campos: `announcement_id`, `user_id`, `read_at`
- **notifications** — sino de notificações por usuário (o Master vê agregado)
  - campos: `user_id`, `title`, `body`, `type`, `link`, `read_at`
- **support_tickets** — suporte bidirecional
  - campos: `user_id` (dono), `subject`, `status` (open/pending/closed), `priority`, `assigned_to`
- **support_messages** — mensagens do ticket (user ↔ master)
  - campos: `ticket_id`, `sender_id`, `sender_role` (user/master), `body`, `attachments`
- **account_status** (ou coluna em `profiles`) — ativar/desativar/suspender conta
  - `profiles.status` enum: `active | suspended | pending`
  - `profiles.plan_activated_at`, `profiles.plan_expires_at` (Master libera acesso manualmente)
- **payment_settings** — configurações globais de pagamento (chaves, gateway, taxas)
  - campos: `provider`, `mode` (test/live), `config` jsonb, `is_active`

RPCs:
- `master_activate_account(_user_id, _plan_id, _expires_at)` — Master libera plano manualmente
- `master_grant_credits(_user_id, _tokens, _reason)` — creditar tokens manualmente
- `master_suspend_account(_user_id, _reason)` — suspender

## 2. Estrutura de rotas `/master/*`

Layout `_master` com sidebar próprio (roxo/dourado, separado visualmente):

```
/master                          → Dashboard Master (KPIs plataforma)
/master/clients                  → Lista de todos usuários (ativar, suspender, ver detalhes)
/master/clients/$id              → Detalhe: plano, créditos, histórico compras, tickets, uso IA
/master/financial                → Financeiro geral (MRR, receita, transações)
/master/financial/orders         → Pedidos de crédito (aprovar/marcar pago manual)
/master/financial/subscriptions  → Assinaturas ativas por cliente
/master/financial/payment-config → Config gateway (Stripe/Paddle keys, modo)
/master/plans                    → CRUD planos (já existe, mover pra cá)
/master/credits/packages         → CRUD pacotes de crédito + ativar/desativar
/master/announcements            → CRUD anúncios (com preview modal)
/master/support                  → Inbox tickets suporte (Master responde)
/master/notifications            → Enviar notificação p/ usuário específico ou todos
/master/system/*                 → Cérebro, Prompts globais, Conexões, API Keys,
                                    Webhooks, Provedores IA, White Label, Config Global
                                    (rotas atuais movidas)
```

## 3. Componentes novos

**Master side:**
- `MasterSidebar` — sidebar dedicado, com badges de contagem (tickets abertos, ordens pendentes)
- `MasterHeader` — com sino de notificações Master (novos tickets, novos pedidos)
- `ClientDetailDrawer` — ficha completa do cliente
- `AnnouncementEditor` — form + preview do modal
- `SupportInbox` — lista de tickets + thread de mensagens

**Client side (usuário comum):**
- `NotificationBell` no topo da página — mostra `notifications` não lidas
- `AnnouncementModal` — abre no login se houver anúncio ativo não lido
- Rota `/support` — cliente abre ticket e conversa com Master
- Badge de suporte no sidebar cliente

## 4. Sidebar do cliente — o que fica

Já limpo. Adicionar apenas:
- Sino de notificações (topo)
- Item "Suporte" no grupo Conta

## 5. Dashboard Master (KPIs)

Cards:
- Total de clientes ativos / suspensos / pendentes
- MRR e receita do mês
- Créditos vendidos / consumidos no mês
- Tickets abertos
- Pedidos pendentes de aprovação
- Uso de IA agregado (tokens, custo)

Gráficos: receita 30d, novos clientes 30d, consumo IA 30d.

## 6. Ordem de entrega (posso fazer em partes)

**Fase 1 — Base + Clientes + Financeiro (esta rodada):**
1. Migração: `announcements`, `announcement_reads`, `notifications`, `support_tickets`, `support_messages`, `profiles.status`, RPCs de ativação
2. Layout `_master` com `MasterSidebar` + `MasterHeader` (sino)
3. `/master` dashboard com KPIs reais
4. `/master/clients` + drawer (ativar conta, dar créditos, ver histórico)
5. `/master/financial` + `/master/financial/orders` (aprovar manualmente)
6. Mover rotas atuais admin para `/master/system/*` (mantém redirects)

**Fase 2 — Anúncios + Suporte + Notificações:**
7. `/master/announcements` + `AnnouncementModal` no root do cliente
8. `/master/support` + `/support` cliente + threads
9. `NotificationBell` no cliente e no master
10. `/master/financial/payment-config` (Stripe keys via secrets)

**Fase 3 — Polimento:**
11. Gráficos no dashboard
12. Badges de contagem no sidebar Master
13. Filtros/exportação CSV em Clientes e Financeiro

## Confirmações

- Confirma **Fase 1** primeiro? É a base que destrava o resto.
- Gateway de pagamento: quer que eu use **Stripe** ou **Paddle** (built-in Lovable), ou só a UI de config por enquanto sem integrar cobrança automática (ativação manual pelo Master)?
- Anúncios: modal aparece **1x por anúncio por usuário** (marca como lido) — ok?
