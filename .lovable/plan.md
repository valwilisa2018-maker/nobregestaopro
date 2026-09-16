# WhatsApp (Evolution) + Follow-up automático

## O que já existe hoje

- Uma única conexão de WhatsApp, com URL e chave guardadas fora do sistema (não editáveis na tela).
- Tela "Conectar WhatsApp" com QR Code, status, desconectar e excluir.
- Um endereço de webhook já recebendo eventos e gravando o status.
- Clientes, vendedores, vendas, permissões por menu e registro de auditoria já prontos para reaproveitar.

Ou seja: a base existe, mas hoje é **um número só** e sem follow-up.

## Como vou entregar (3 etapas)

Como o pedido é grande, proponho entregar em etapas testáveis. Cada etapa fica funcional de ponta a ponta antes da próxima.

### Etapa 1 — Configurações + múltiplos números

- Nova seção em Configurações: "WhatsApp / Evolution API" com URL, chave, nome da integração, "Testar conexão" e "Salvar". A chave é gravada no servidor e sempre exibida mascarada (••••1234).
- Teste de conexão real (requisição feita pelo servidor), com os estados: conectado, desconectado, erro de autenticação, indisponível.
- Painel do webhook: endereço, se já recebeu eventos, último evento (tipo, instância, data/hora) e botão "Testar webhook".
- "Enviar mensagem de teste" (número + mensagem) mostrando o retorno real.
- Tela "Conectar WhatsApp" reescrita para vários números: lista de conexões com nome, responsável, número, foto, status colorido e data da conexão.
- Fluxo "+ Conectar novo WhatsApp": dados da conexão → criação da instância → QR Code com instruções passo a passo → status atualiza sozinho.
- Ações por conexão: ver detalhes, renomear, trocar responsável, atualizar status, novo QR Code, reconectar, desconectar e excluir (com confirmação, sem afetar clientes/vendas).
- Se a Evolution API não estiver configurada, a tela mostra o aviso e o botão "Ir para Configurações".

### Etapa 2 — Base de dados, webhook e histórico do cliente

- Novas tabelas: configuração da integração, conexões de WhatsApp (ligadas ao vendedor), eventos do webhook, mensagens, regras de follow-up, fila de follow-up e histórico.
- Webhook reforçado: valida a origem, ignora eventos repetidos, grava conexão/QR/mensagens recebidas e enviadas, atualiza o status real de cada número.
- Na ficha do cliente: aba "WhatsApp / Follow-up" com última mensagem, última interação, próximo follow-up, enviados e cancelados, além de "Enviar mensagem pelo WhatsApp".
- Interruptor por cliente: permitir ou bloquear mensagens automáticas, e pausar follow-up.
- Números de telefone normalizados (DDI 55 tratado sem duplicar).

### Etapa 3 — Follow-up automático

- Novo menu "Follow-up" com cartões (agendados hoje, pendentes, enviados, falharam, regras ativas) e abas Agendados / Enviados / Falharam / Regras / Configurações.
- Lista: cliente, vendedor, WhatsApp, regra, envio previsto, status; ações ver, editar data, enviar agora, cancelar.
- Criação de regra: nome, evento, esperar X dias, WhatsApp (do vendedor / específico / padrão), responsável, mensagem com variáveis ({{nome}}, {{primeiro_nome}}, {{vendedor}}...), horário e dias permitidos, ativa/inativa.
- Eventos na 1ª versão (com dados confiáveis hoje): cliente cadastrado, cliente comprou, venda concluída, X dias sem conversa, cliente não respondeu, data manual e início manual. Os demais ficam previstos na estrutura.
- Processamento automático no servidor (agendado, sem depender de página aberta), com trava contra envio duplicado, novas tentativas controladas e, se o número estiver desconectado, o follow-up aguarda a reconexão em vez de ser perdido.
- Se o cliente responder antes do prazo, o follow-up de "não respondeu" é cancelado sozinho.
- Auditoria das operações importantes, sem gravar chaves nem segredos.

## Detalhes técnicos

- Tabelas novas: `evolution_settings`, `whatsapp_connections` (com `seller_id`), `whatsapp_messages`, `whatsapp_webhook_events`, `followup_rules`, `followup_queue`, `followup_history`; RLS + GRANTs por permissão de módulo, reaproveitando `has_permission`. `whatsapp_status` atual é migrado para `whatsapp_connections`.
- Toda chamada à Evolution API continua em `src/lib/evolution.functions.ts` (server functions autenticadas); chave lida no servidor, nunca no navegador; token do webhook validado no endpoint `src/routes/api/public/evolution-webhook.ts`.
- Fila processada por rota pública protegida por segredo, chamada por agendamento (pg_cron), com `SELECT ... FOR UPDATE SKIP LOCKED` e chave de idempotência por item.
- Novos módulos de permissão `followup` e reaproveitamento do módulo `whatsapp` no sidebar/`access-control`.
- Visual e componentes seguem o padrão atual (PageHero, cards, badges, toasts em português).

## Fora do escopo agora

- Caixa de entrada/conversa completa de WhatsApp (só histórico e envio pontual).
- Multiempresa: a plataforma hoje é de uma empresa só; as tabelas ficam preparadas, sem separação por empresa.
