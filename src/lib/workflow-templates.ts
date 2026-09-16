// Modelos de fluxo prontos (client-safe). Só usam blocos que já funcionam de verdade.
import { newBlock, type WorkflowBlock, type WorkflowBlockType } from "@/lib/workflow-shared";

type Step = {
  type: WorkflowBlockType;
  patch?: Partial<WorkflowBlock>;
  /** Caminho "sim" e "não" para blocos de condição, por índice na lista. */
  branch?: { yes: number; no: number };
};

export type WorkflowTemplate = {
  slug: string;
  name: string;
  kind: string;
  description: string;
  /** Gatilho sugerido para o fluxo. */
  suggestedTrigger: string;
  steps: Step[];
};

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    slug: "boas-vindas",
    name: "Boas-vindas ao cliente novo",
    kind: "comercial",
    description:
      "Cumprimenta quem acabou de entrar em contato, pergunta o que a pessoa procura e avisa o vendedor.",
    suggestedTrigger: "customer_created",
    steps: [
      { type: "trigger" },
      { type: "typing", patch: { seconds: 3 } },
      {
        type: "send_message",
        patch: {
          text: "Olá {{primeiro_nome}}! Aqui é o {{vendedor}} da {{empresa}}. Que bom falar com você 😊",
        },
      },
      {
        type: "question",
        patch: { text: "Para eu te ajudar melhor: o que você está procurando hoje?" },
      },
      { type: "tags", patch: { tags: ["novo contato"] } },
      { type: "handoff" },
    ],
  },
  {
    slug: "pos-venda",
    name: "Pós-venda de quem já comprou",
    kind: "pos_venda",
    description:
      "Agradece a compra, confirma se tudo chegou certo e pede uma avaliação de quem já é cliente.",
    suggestedTrigger: "followup",
    steps: [
      { type: "trigger" },
      {
        type: "send_message",
        patch: {
          text: "Oi {{primeiro_nome}}! Passando para agradecer a sua compra de {{produto}} 💚",
        },
      },
      { type: "delay", patch: { waitMinutes: 60 } },
      {
        type: "yes_no",
        patch: {
          text: "Ficou tudo certo com o seu pedido?",
          keywords: ["sim", "certo", "ok", "gostei", "perfeito"],
        },
        branch: { yes: 4, no: 5 },
      },
      {
        type: "send_message",
        patch: {
          text: "Que ótimo! Se puder deixar sua avaliação para nós, ajuda muito. Obrigado, {{primeiro_nome}}!",
        },
      },
      {
        type: "send_message",
        patch: {
          text: "Sinto muito por isso. Vou chamar {{vendedor}} agora mesmo para resolver com você.",
        },
      },
      { type: "handoff" },
    ],
  },
  {
    slug: "nao-responde",
    name: "Cliente que não responde",
    kind: "recuperacao",
    description:
      "Faz duas tentativas espaçadas de retomar a conversa e encerra sem incomodar quem não responde.",
    suggestedTrigger: "followup",
    steps: [
      { type: "trigger" },
      {
        type: "send_message",
        patch: { text: "Oi {{primeiro_nome}}, tudo bem? Vi que a nossa conversa ficou parada." },
      },
      { type: "wait_reply", patch: { timeoutMinutes: 1440 } },
      { type: "delay", patch: { waitMinutes: 2880 } },
      {
        type: "question",
        patch: {
          text: "Ainda tem interesse? Se preferir, me diga o melhor dia para eu te chamar.",
        },
      },
      { type: "tags", patch: { tags: ["sem resposta"] } },
      { type: "end" },
    ],
  },
  {
    slug: "novidades",
    name: "Novidades e lançamentos",
    kind: "comercial",
    description:
      "Anuncia uma novidade com imagem, confirma o interesse e marca quem quer receber a proposta.",
    suggestedTrigger: "tag_added",
    steps: [
      { type: "trigger" },
      {
        type: "send_message",
        patch: { text: "{{primeiro_nome}}, temos uma novidade que combina com você 👀" },
      },
      { type: "send_image", patch: { mediaUrl: "", caption: "Olha só o que preparamos!" } },
      {
        type: "yes_no",
        patch: {
          text: "Quer que eu envie os detalhes e o valor?",
          keywords: ["sim", "quero", "pode", "manda", "ok"],
        },
        branch: { yes: 4, no: 6 },
      },
      { type: "tags", patch: { tags: ["interessado novidade"] } },
      { type: "handoff" },
      {
        type: "send_message",
        patch: { text: "Sem problema! Qualquer coisa estou por aqui, {{primeiro_nome}}." },
      },
      { type: "end" },
    ],
  },
  {
    slug: "orcamento",
    name: "Orçamento enviado sem resposta",
    kind: "orcamento",
    description:
      "Retoma quem recebeu orçamento, pergunta se ficou dúvida e encaminha para o vendedor fechar.",
    suggestedTrigger: "followup",
    steps: [
      { type: "trigger" },
      {
        type: "send_message",
        patch: {
          text: "Oi {{primeiro_nome}}! Consegui te enviar o orçamento no dia {{data_compra}}. Conseguiu ver?",
        },
      },
      {
        type: "yes_no",
        patch: {
          text: "Ficou alguma dúvida sobre os valores?",
          keywords: ["sim", "duvida", "dúvida", "quero", "ficou"],
        },
        branch: { yes: 3, no: 4 },
      },
      { type: "handoff" },
      {
        type: "send_message",
        patch: { text: "Perfeito! Quando decidir, me chama que eu já garanto sua condição." },
      },
      { type: "end" },
    ],
  },
  {
    slug: "agendamento",
    name: "Agendar conversa com o vendedor",
    kind: "comercial",
    description: "Pede o melhor dia e horário do cliente e avisa o vendedor responsável.",
    suggestedTrigger: "manual",
    steps: [
      { type: "trigger" },
      {
        type: "send_message",
        patch: { text: "{{primeiro_nome}}, quero te ligar para explicar tudo com calma." },
      },
      { type: "schedule", patch: { text: "Qual o melhor dia e horário para você?" } },
      {
        type: "send_message",
        patch: { text: "Anotado! {{vendedor}} vai te chamar nesse horário. Obrigado!" },
      },
      { type: "tags", patch: { tags: ["agendado"] } },
      { type: "end" },
    ],
  },
];

/** Monta os blocos do modelo, já posicionados no quadro e ligados em sequência. */
export function templateBlocks(template: WorkflowTemplate): WorkflowBlock[] {
  const blocks = template.steps.map((step, index) =>
    Object.assign(newBlock(step.type, { x: 80 + (index % 2) * 320, y: 60 + index * 170 }), step.patch),
  );
  template.steps.forEach((step, index) => {
    const block = blocks[index];
    if (!block) return;
    if (step.branch) {
      block.nextIfMatch = blocks[step.branch.yes]?.id ?? null;
      block.nextIfNoMatch = blocks[step.branch.no]?.id ?? null;
      block.nextId = null;
      return;
    }
    block.nextId = blocks[index + 1]?.id ?? null;
  });
  return blocks;
}
