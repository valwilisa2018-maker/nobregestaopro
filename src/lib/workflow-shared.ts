// Client-safe helpers shared between the Workflow UI and the server engine.

export type WorkflowBlockType =
  | "send_message"
  | "wait_reply"
  | "condition"
  | "delay"
  | "assign_seller"
  | "handoff"
  | "end";

export type WorkflowBlock = {
  id: string;
  type: WorkflowBlockType;
  text?: string;
  waitMinutes?: number;
  timeoutMinutes?: number;
  keywords?: string[];
  nextId?: string | null;
  nextIfMatch?: string | null;
  nextIfNoMatch?: string | null;
  transferSellerId?: string | null;
  transferMode?: "keep_owner" | "end_current" | "start_target";
  note?: string;
};

export const BLOCK_TYPES: {
  value: WorkflowBlockType;
  label: string;
  description: string;
}[] = [
  {
    value: "send_message",
    label: "Enviar mensagem",
    description: "Envia um texto pelo WhatsApp do fluxo.",
  },
  {
    value: "wait_reply",
    label: "Esperar resposta",
    description: "Pausa a conversa até o cliente responder (com tempo limite opcional).",
  },
  {
    value: "condition",
    label: "Condição",
    description: "Segue caminhos diferentes conforme as palavras da resposta.",
  },
  { value: "delay", label: "Aguardar tempo", description: "Espera um tempo antes de continuar." },
  {
    value: "assign_seller",
    label: "Atribuir vendedor",
    description: "Registra o vendedor responsável pelo atendimento.",
  },
  {
    value: "handoff",
    label: "Encaminhar para atendimento",
    description: "Para a automação e avisa que alguém deve continuar manualmente.",
  },
  { value: "end", label: "Encerrar fluxo", description: "Finaliza a conversa automática." },
];

export const WORKFLOW_KINDS = [
  { value: "comercial", label: "Comercial" },
  { value: "orcamento", label: "Orçamento" },
  { value: "pos_venda", label: "Pós-venda" },
  { value: "recuperacao", label: "Recuperação de cliente" },
  { value: "outro", label: "Outro" },
];

export const WORKFLOW_TRIGGERS: {
  value: string;
  label: string;
  description: string;
  ready: boolean;
}[] = [
  {
    value: "customer_created",
    label: "Cliente novo cadastrado",
    description: "Inicia quando um cliente novo é cadastrado.",
    ready: true,
  },
  {
    value: "keyword",
    label: "Cliente enviou uma palavra",
    description: "Inicia quando a mensagem do cliente contém a palavra escolhida.",
    ready: true,
  },
  {
    value: "manual",
    label: "Início manual pelo vendedor",
    description: "O vendedor inicia pela ficha do cliente.",
    ready: true,
  },
  {
    value: "followup",
    label: "Iniciado pelo Follow-up",
    description: "Um follow-up pode iniciar este fluxo.",
    ready: true,
  },
];

export const UNAVAILABLE_TRIGGERS = [
  "Tag adicionada ao cliente",
  "Formulário gerou lead",
  "Início por API externa",
];

export const RUN_STATUS_LABEL: Record<string, string> = {
  RUNNING: "Em andamento",
  WAITING_REPLY: "Aguardando resposta",
  WAITING_TIME: "Aguardando tempo",
  HANDOFF: "Encaminhado para atendimento",
  DONE: "Concluído",
  FAILED: "Com erro",
  CANCELLED: "Cancelado",
};

export const WORKFLOW_STATUS_LABEL: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
};

export const VISIBILITY_LABEL: Record<string, string> = {
  private: "Privado",
  shared: "Compartilhado",
  template: "Modelo da empresa",
};

export function blockTypeLabel(type?: string | null) {
  return BLOCK_TYPES.find((b) => b.value === type)?.label ?? (type ?? "—");
}

export function newBlock(type: WorkflowBlockType): WorkflowBlock {
  const id = `b${Math.random().toString(36).slice(2, 9)}`;
  if (type === "send_message") return { id, type, text: "" };
  if (type === "wait_reply") return { id, type, timeoutMinutes: 1440 };
  if (type === "delay") return { id, type, waitMinutes: 60 };
  if (type === "condition") return { id, type, keywords: [] };
  if (type === "assign_seller") return { id, type, transferMode: "keep_owner" };
  return { id, type };
}

/** Validação usada na tela e repetida no servidor. */
export function validateBlocks(blocks: WorkflowBlock[]): string | null {
  if (!blocks.length) return "Adicione pelo menos um bloco ao fluxo.";
  const first = blocks[0];
  if (first && first.type !== "send_message")
    return "O primeiro bloco precisa ser uma mensagem enviada.";
  for (const block of blocks) {
    if (block.type === "send_message" && !block.text?.trim())
      return "Escreva o texto de todas as mensagens.";
    if (block.type === "condition" && !(block.keywords ?? []).filter(Boolean).length)
      return "Informe as palavras da condição.";
  }
  return null;
}
