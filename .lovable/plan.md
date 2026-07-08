# Separação Admin Master vs Cliente

## 1. Banco de dados (migração)

- Adicionar valor `'master'` ao enum `public.app_role`.
- Manter `has_role(_user_id, _role)` como está (já funciona com o novo valor).
- Criar helper `is_master(uid)` (SECURITY DEFINER) para uso em policies/UI.
- Conceder o papel `master` ao seu usuário via INSERT em `user_roles` (você me confirma o email para eu incluir na migração, ou eu deixo um comentário SQL pronto pra rodar).

## 2. Novo papel na UI

- `src/components/master-guard.tsx`: igual ao `AdminGuard` mas checa role `master`; redireciona não-master para `/dashboard`.
- Atualizar `AppSidebar` para:
  - Detectar `isMaster` além de `isAdmin`.
  - **Remover** do sidebar do cliente os grupos que passam a ser Master-only.
  - Se `isMaster`, mostrar botão "Painel Master" que leva para `/master`.

## 3. Rota `/master` com layout próprio

- `src/routes/_master.tsx`: pathless layout com `MasterGuard`, sidebar próprio (`MasterSidebar`) e header identificando "Admin Master".
- `src/routes/_master/index.tsx`: dashboard master (visão geral da plataforma: total de clientes, uso IA, receita).
- Mover para `/master/*` (novos arquivos que reusam os componentes existentes):
  - `/master/users` (era `/users`)
  - `/master/permissions` (era `/permissions`)
  - `/master/plans` (era `/plans`)
  - `/master/brain` (era `/brain`)
  - `/master/prompts-globais` (novo, prompts marcados como globais)
  - `/master/connections` (era `/connections`)
  - `/master/api-keys` (era `/api`)
  - `/master/webhooks` (era `/webhooks`)
  - `/master/ai-providers` (era `/ai`)
  - `/master/white-label` (era `/white-label`)
  - `/master/settings-globais` (era `/admin-settings`)
  - `/master/billing` (billing da plataforma — receita/assinaturas)

## 4. Rotas antigas

- Manter os arquivos antigos como **redirects** para `/master/...` durante 1 versão, para não quebrar links salvos. Depois removemos.
- Sidebar do cliente deixa de listar essas rotas.

## 5. O que fica na plataforma do cliente

Grupos mantidos no sidebar cliente:
- Workspace: Dashboard, Agentes, Agenda, Chats, Mensagens, Conhecimento
- Automação: Follow-up, Contatos, Workflows, Disparo, WhatsApp
- Insights: Prompts (só os do próprio user), Clientes, Histórico, Logs, Debug
- Financeiro: Meu Plano, Créditos IA
- Conta: Configurações

## Detalhes técnicos

- `MasterGuard` usa `supabase.rpc("has_role", { _user_id, _role: "master" })`.
- `AppSidebar` faz duas RPCs em paralelo (`admin` e `master`) ou uma única query em `user_roles` filtrando os dois papéis.
- Cada rota nova sob `_master/` é um wrapper mínimo importando o componente já existente da rota antiga (evita duplicação).
- Redirects: `createFileRoute("/users")({ beforeLoad: () => { throw redirect({ to: "/master/users" }) } })`.

## Fora de escopo (fica pra depois)

- Split de dados por tenant (multi-tenant real).
- Billing separado por cliente da plataforma.
- Confirme se quer que eu **já promova seu usuário a `master`** na migração — se sim, me passe o email cadastrado.
