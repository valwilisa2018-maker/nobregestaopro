// Client-safe helpers shared between the Workflow UI and the server engine.

export type WorkflowBlockType =
  | "trigger"
  | "send_message"
  | "send_image"
  | "send_video"
  | "send_audio"
  | "typing"
  | "recording"
  | "question"
  | "capture_name"
  | "wait_reply"
  | "condition"
  | "yes_no"
  | "delay"
  | "tags"
  | "sequence"
  | "schedule"
  | "broadcast"
  | "webhook"
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
  /** Endereço do arquivo (imagem, vídeo ou áudio). */
  mediaUrl?: string;
  /** Legenda do arquivo enviado. */
  caption?: string;
  /** Segundos de "digitando"/"gravando". */
  seconds?: number;
  /** Etiquetas aplicadas ao cliente. */
  tags?: string[];
  /** Número que recebe o aviso interno (bloco Disparo). */
  targetPhone?: string;
  /** Endereço chamado pelo bloco Webhook. */
  url?: string;
  /** Posição no quadro visual (opcional; blocos antigos recebem layout automático). */
  x?: number;
  y?: number;
};

/** Blocos que param o fluxo esperando a resposta do cliente. */
export const WAIT_REPLY_BLOCKS: WorkflowBlockType[] = [
  "wait_reply",
  "question",
  "capture_name",
  "sequence",
  "schedule",
];

/** Blocos que encerram o caminho (não têm bloco seguinte). */
export const TERMINAL_BLOCKS: WorkflowBlockType[] = ["end", "handoff"];

export const BLOCK_TYPES: {
  value: WorkflowBlockType;
  label: string;
  description: string;
}[] = [
  { value: "trigger", label: "Gatilho", description: "Início do fluxo." },
  {
    value: "send_message",
    label: "Mensagem",
    description: "Envia um texto pelo WhatsApp do fluxo.",
  },
  { value: "send_image", label: "Imagem", description: "Envia uma imagem com legenda." },
  { value: "send_video", label: "Vídeo", description: "Envia um vídeo com legenda." },
  { value: "send_audio", label: "Áudio", description: "Envia um áudio de voz." },
  {
    value: "typing",
    label: "Digitando",
    description: "Mostra “digitando...” por alguns segundos.",
  },
  {
    value: "recording",
    label: "Gravando",
    description: "Mostra “gravando áudio...” por alguns segundos.",
  },
  {
    value: "question",
    label: "Pergunta",
    description: "Faz uma pergunta e aguarda a resposta.",
  },
  {
    value: "capture_name",
    label: "Capturar nome",
    description: "Pergunta o nome e salva na ficha do cliente.",
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
  {
    value: "yes_no",
    label: "Sim / Não",
    description: "Divide o fluxo entre resposta positiva e negativa.",
  },
  { value: "delay", label: "Aguardar tempo", description: "Espera um tempo antes de continuar." },
  {
    value: "tags",
    label: "Etiquetas",
    description: "Adiciona etiquetas na ficha do cliente.",
  },
  {
    value: "sequence",
    label: "Sequência",
    description: "Adiciona etiqueta e aguarda a resposta do cliente.",
  },
  {
    value: "schedule",
    label: "Agendamento",
    description: "Pede um horário e registra a resposta no histórico.",
  },
  {
    value: "broadcast",
    label: "Disparo",
    description: "Envia um aviso para outro número (equipe ou vendedor).",
  },
  {
    value: "webhook",
    label: "Webhook",
    description: "Chama um sistema externo com os dados do cliente.",
  },
  {
    value: "assign_seller",
    label: "Atribuir vendedor",
    description: "Registra o vendedor responsável pelo atendimento.",
  },
  {
    value: "handoff",
    label: "Atendente",
    description: "Para a automação e transfere para atendimento humano.",
  },
  { value: "end", label: "Fim", description: "Finaliza a conversa automática." },
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
  {
    value: "tag_added",
    label: "Etiqueta adicionada ao cliente",
    description: "Inicia quando a etiqueta escolhida é adicionada na ficha do cliente.",
    ready: true,
  },
  {
    value: "form_lead",
    label: "Formulário gerou lead",
    description: "Inicia quando um formulário do site envia um novo contato para a plataforma.",
    ready: true,
  },
  {
    value: "api",
    label: "Início por sistema externo (API)",
    description: "Permite que outro sistema inicie este fluxo para um cliente.",
    ready: true,
  },
];

export const TRIGGER_TYPES = WORKFLOW_TRIGGERS.map((t) => t.value);

export const UNAVAILABLE_TRIGGERS: string[] = [];

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

export function newBlock(
  type: WorkflowBlockType,
  position?: { x: number; y: number },
): WorkflowBlock {
  const id = `b${Math.random().toString(36).slice(2, 9)}`;
  const at = { x: position?.x ?? 120, y: position?.y ?? 120 };
  if (type === "send_message" || type === "broadcast") return { id, type, text: "", ...at };
  if (type === "question") return { id, type, text: "", timeoutMinutes: 1440, ...at };
  if (type === "capture_name")
    return { id, type, text: "Como você se chama?", timeoutMinutes: 1440, ...at };
  if (type === "schedule")
    return { id, type, text: "Qual o melhor dia e horário para você?", timeoutMinutes: 1440, ...at };
  if (type === "sequence") return { id, type, tags: [], timeoutMinutes: 1440, ...at };
  if (type === "wait_reply") return { id, type, timeoutMinutes: 1440, ...at };
  if (type === "delay") return { id, type, waitMinutes: 60, ...at };
  if (type === "condition") return { id, type, keywords: [], ...at };
  if (type === "yes_no")
    return { id, type, keywords: ["sim", "quero", "pode", "ok"], ...at };
  if (type === "tags") return { id, type, tags: [], ...at };
  if (type === "typing" || type === "recording") return { id, type, seconds: 3, ...at };
  if (type === "send_image" || type === "send_video")
    return { id, type, mediaUrl: "", caption: "", ...at };
  if (type === "send_audio") return { id, type, mediaUrl: "", ...at };
  if (type === "webhook") return { id, type, url: "", ...at };
  if (type === "assign_seller") return { id, type, transferMode: "keep_owner", ...at };
  return { id, type, ...at };
}


export const CANVAS_BLOCK_WIDTH = 240;
export const CANVAS_BLOCK_HEIGHT = 104;

/** Coloca em coluna os blocos que ainda não têm posição salva. */
export function autoLayout(blocks: WorkflowBlock[]): WorkflowBlock[] {
  return blocks.map((block, index) => ({
    ...block,
    x: 40,
    y: 30 + index * (CANVAS_BLOCK_HEIGHT + 50),
  }));
}

/** Garante posição para blocos criados antes do quadro visual. */
export function ensurePositions(blocks: WorkflowBlock[]): WorkflowBlock[] {
  const missing = blocks.some((b) => typeof b.x !== "number" || typeof b.y !== "number");
  return missing ? autoLayout(blocks) : blocks;
}

/** Validação usada na tela e repetida no servidor. */
export function validateBlocks(blocks: WorkflowBlock[]): string | null {
  if (!blocks.length) return "Adicione pelo menos um bloco ao fluxo.";
  const first = blocks[0];
  if (first && first.type !== "send_message" && first.type !== "trigger")
    return "O fluxo precisa começar por um Gatilho ou por uma mensagem.";
  for (const block of blocks) {
    if (block.type === "send_message" && !block.text?.trim())
      return "Escreva o texto de todas as mensagens.";
    if ((block.type === "question" || block.type === "capture_name") && !block.text?.trim())
      return "Escreva a pergunta de todos os blocos de pergunta.";
    if (block.type === "broadcast" && (!block.text?.trim() || !block.targetPhone?.trim()))
      return "No bloco Disparo, informe o número e o texto do aviso.";
    if (
      (block.type === "send_image" || block.type === "send_video" || block.type === "send_audio") &&
      !block.mediaUrl?.trim()
    )
      return "Informe o endereço do arquivo nos blocos de imagem, vídeo e áudio.";
    if (block.type === "webhook" && !block.url?.trim())
      return "Informe o endereço do webhook.";
    if (
      (block.type === "tags" || block.type === "sequence") &&
      !(block.tags ?? []).filter(Boolean).length
    )
      return "Informe as etiquetas dos blocos de etiqueta.";
    if (
      (block.type === "condition" || block.type === "yes_no") &&
      !(block.keywords ?? []).filter(Boolean).length
    )
      return "Informe as palavras da condição.";
  }
  return null;
}

