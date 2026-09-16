# Workflow por vendedor — módulo próprio

Novo módulo **Workflow** (menu Operação), separado de Follow-up e de Conectar WhatsApp, mas integrado a Clientes, Vendedores e às conexões da Evolution API. Cada fluxo tem dono: o vendedor responsável.

## Etapa 1 — Base e propriedade do fluxo

- Tabelas novas: fluxos, versões (rascunho/publicada), blocos, gatilhos, execuções, passos da execução, variáveis e compartilhamentos.
- Todo fluxo guarda: criado por, proprietário, vendedor responsável, conexão de WhatsApp padrão, tipo, descrição, visibilidade (privado / compartilhado / modelo da empresa), status e data.
- Regras de acesso no banco: o vendedor vê e edita os seus; gestor/admin vê os da equipe; modelos da empresa são visíveis a todos, editáveis só por quem administra modelos.
- O responsável nunca vem do navegador: o servidor confirma que o usuário logado é aquele vendedor (ou tem permissão de gestão) e que a conexão de WhatsApp escolhida pertence ao vendedor.

## Etapa 2 — Tela do Workflow

- Lista com filtros: **Meus workflows**, **Todos** (só com permissão de gestão), **Compartilhados comigo**, **Modelos da empresa**.
- **+ Criar Workflow**: nome, responsável (já vem o vendedor logado), WhatsApp padrão (lista só as conexões daquele vendedor), tipo, descrição.
- Ações por fluxo: abrir, editar, ativar/pausar, duplicar para os meus, usar modelo, excluir.
- Duplicar/usar modelo cria uma cópia que pertence a quem duplicou, sem tocar no original.

## Etapa 3 — Construtor de conversa

- Editor de blocos em sequência: enviar mensagem, esperar resposta, condição (contém palavra / sem resposta em X tempo), aguardar tempo, atribuir cliente ao vendedor, encaminhar para atendimento humano, encerrar.
- Variáveis de mensagem iguais às do Follow-up ({{primeiro_nome}}, {{vendedor}}, etc.), variável inexistente nunca quebra o envio.
- Rascunho e publicação: execuções em andamento continuam na versão que iniciaram.
- Gatilhos por fluxo: cliente novo, palavra recebida, início manual, início pelo Follow-up, e um marcador de "workflow padrão do vendedor" para clientes novos. Gatilhos sem dados confiáveis hoje (tags, formulário, API externa) ficam listados como indisponíveis, não inventados.

## Etapa 4 — Execução e resposta do cliente

- Execução sempre amarrada a: fluxo, versão, vendedor, cliente, conexão de WhatsApp.
- Mensagens saem sempre pela conexão do fluxo.
- Resposta recebida: o webhook resolve conexão → cliente → execução ativa **naquela conexão** → bloco que espera resposta, e continua só aquela conversa. Nada de casar apenas pelo telefone.
- Avanço por tempo (espera, sem resposta) roda no worker do servidor que já existe, junto com o do Follow-up — nada de temporizador no navegador.
- Bloco de transferência de vendedor com escolha explícita: encerrar o fluxo atual, iniciar o fluxo do novo vendedor, ou continuar mantendo o dono original.

## Etapa 5 — Cliente, painéis e auditoria

- Na ficha do cliente: botão **Iniciar Workflow** (escolhe fluxo e conexão) e histórico da conversa automática com o vendedor responsável.
- Painel do vendedor: meus fluxos ativos, conversas em andamento, aguardando resposta, encaminhados, concluídos, erros — só os dele.
- Painel do gestor: mesma visão por vendedor, com filtro de vendedor (só com permissão de gestão).
- Registro de auditoria: fluxo criado/alterado/publicado/excluído, execução iniciada/encerrada, falha de envio — sem nenhum dado sigiloso.

## Notas técnicas

- Tabelas `workflows`, `workflow_versions`, `workflow_blocks`, `workflow_triggers`, `workflow_shares`, `workflow_runs`, `workflow_run_steps`, com RLS por dono (`owner_user_id`) e por permissão de módulo; GRANTs no mesmo migration.
- Coluna de tenant já preparada nas tabelas para quando a plataforma virar multiempresa (hoje uma empresa só).
- Permissões: novo módulo `workflow` (view/create/edit/delete) em `MENU_MODULES` + capacidades de equipe/modelos derivadas de `has_role('admin'|'super_admin')`, validadas em cada server function, nunca só na tela.
- Server functions em `src/lib/workflow.functions.ts` com `requireSupabaseAuth`; motor em `src/lib/workflow.server.ts`; envio reutiliza `sendWhatsappText` de `whatsapp.server.ts`.
- Continuação por resposta entra no webhook `api/public/evolution-webhook.ts`; avanço por tempo entra no tick de `api/public/followup-worker.ts` (mesmo cron), sem alterar as regras de Follow-up existentes.
- Rota `/workflow` (lista + painel) e `/workflow/$workflowId` (construtor), no padrão `_authenticated`.
