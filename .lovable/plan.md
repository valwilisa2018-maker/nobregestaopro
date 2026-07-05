
# Módulo "Créditos IA"

Módulo premium para o cliente ver, consumir e comprar créditos de IA sem precisar entender tokens.

## Escopo entregue agora
1. **Banco de dados** (novas tabelas + funções)
2. **Página `/credits`** com dashboard + histórico + botão comprar
3. **Modal premium** com 4 pacotes
4. **Consumo automático** via função no banco (chamada pelos agentes)
5. **Bloqueio de IA** quando saldo zera

Integração de **pagamento fica preparada mas desativada** (botão "Comprar" cria um pedido `pending`). A ativação real (Stripe/Mercado Pago/PIX) exige plano Pro + escolha de provedor e será uma etapa separada.

## 1. Banco de dados

Novas tabelas:

- `credit_wallets` — 1 por usuário
  - `user_id`, `plan_tokens_remaining`, `extra_tokens_remaining`, `plan_tokens_reset_at`, `updated_at`
- `credit_transactions` — histórico consolidado (débitos e créditos)
  - `user_id`, `agent_id`, `model`, `input_tokens`, `output_tokens`, `total_tokens`, `cost_cents`, `kind` (`usage` | `purchase` | `plan_grant`), `status`, `occurred_at`
- `credit_packages` — catálogo dos 4 pacotes (5M, 20M, 50M, 100M)
- `credit_orders` — pedidos de compra (`pending` | `paid` | `failed`), `provider` opcional

Funções (RPC):
- `consume_ai_tokens(user, agent, model, input, output, cost_cents)` — desconta primeiro do plano, depois do extra, grava transação, devolve `{allowed, remaining}`
- `grant_plan_tokens(user)` — restaura tokens do plano no início do ciclo (mantém extras)
- `credit_purchase(user, package_id)` — cria order e, quando marcada `paid`, credita `extra_tokens_remaining`

RLS: usuário só lê/atualiza a própria wallet, transações e orders. Pacotes são públicos read-only.

## 2. Menu lateral

Renomear/adicionar item **"Créditos IA"** → `/credits` com ícone `Coins` (o item atual já existe como "Créditos de IA" → `/plans`; vou trocar rota para `/credits` e manter os planos como sub-fluxo do módulo).

## 3. Página `/credits` — Dashboard

5 cartões no topo:
1. **Créditos Disponíveis** — total (plano + extra) formatado como tokens, com barra de progresso vs. total do plano
2. **Plano Atual** — nome, tokens inclusos, dias até renovação
3. **Consumo Hoje** — soma de `usage` do dia
4. **Consumo no Mês** — soma de `usage` do mês
5. **Estimativa Restante** — `saldo / média_diária` → "durará ~X dias"

Botão grande **Comprar Créditos** abre o modal.

## 4. Histórico de consumo

Tabela com: Data, Agente, Modelo, Input, Output, Total, Custo, Status.
Recursos: busca por agente/modelo, filtros (data, tipo), paginação, **Exportar CSV** (client-side).
Exportar Excel: entrego CSV compatível com Excel; XLSX real exigiria lib extra (aviso o usuário).

## 5. Modal de compra

4 cards premium (mesma estética verde/gradiente dos planos):
- 5M — R$ 29,90
- 20M — R$ 99,90 (destaque "Mais escolhido")
- 50M — R$ 219,90
- 100M — R$ 399,90 (destaque "Melhor custo")

Botão **Comprar Agora** → cria `credit_order` `pending` e mostra toast "Integração de pagamento em breve". Estrutura pronta para plugar Stripe/MP depois.

## 6. Consumo automático

Onde os agentes já chamam IA (edge functions / server fns existentes), adicionar chamada a `consume_ai_tokens` **antes** da chamada real ao modelo:
- se `allowed=false` → devolver mensagem padrão de saldo esgotado
- se `allowed=true` → prosseguir e depois lançar consumo com tokens reais devolvidos pela API

Vou implementar a função RPC + um wrapper `useCreditGuard` do lado servidor. Ajuste dos pontos exatos de chamada nos agentes: se houver mais de 1–2 locais, listo e ajusto todos.

## 7. Bloqueio quando zera

Componente `CreditsExhaustedBanner` global (junto do `PlanStatus`) aparece quando saldo total = 0, com CTA "Comprar Créditos".

## 8. Renovação do ciclo

Função `grant_plan_tokens` chamada:
- na primeira leitura da wallet após `plan_tokens_reset_at < now()`
- garante que **extras nunca expiram**

## Fora do escopo desta entrega
- Integração real com Stripe / Mercado Pago / Asaas / Pagar.me / PagSeguro / PIX / Boleto (cada uma é uma etapa própria — recomendo começar por **Stripe seamless** depois desta entrega)
- Geração de XLSX nativo (entrego CSV)
- Webhooks de pagamento reais (a estrutura de `credit_orders` já suporta)

Confirma que posso seguir?
