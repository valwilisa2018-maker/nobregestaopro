// Client-safe helpers shared between the Follow-up UI and the server.

export type TriggerEvent =
  | "customer_created"
  | "customer_purchased"
  | "sale_completed"
  | "no_response"
  | "days_since_conversation"
  | "manual_date"
  | "manual_start";

export const TRIGGER_EVENTS: { value: TriggerEvent; label: string; description: string; ready: boolean }[] =
  [
    {
      value: "customer_created",
      label: "Cliente cadastrado",
      description: "Conta os dias a partir do cadastro do cliente.",
      ready: true,
    },
    {
      value: "customer_purchased",
      label: "Cliente comprou",
      description: "Conta os dias a partir da data da venda (pós-venda).",
      ready: true,
    },
    {
      value: "sale_completed",
      label: "Venda concluída (entrega/pagamento)",
      description: "Conta os dias a partir da venda totalmente paga.",
      ready: true,
    },
    {
      value: "no_response",
      label: "Cliente não respondeu",
      description: "Conta os dias desde a última mensagem enviada, e cancela se o cliente responder.",
      ready: true,
    },
    {
      value: "days_since_conversation",
      label: "X dias depois da última conversa",
      description: "Conta os dias desde a última interação registrada.",
      ready: true,
    },
    {
      value: "manual_date",
      label: "Data manual",
      description: "Você escolhe a data do envio.",
      ready: true,
    },
    {
      value: "manual_start",
      label: "Follow-up iniciado manualmente",
      description: "Só entra na fila quando alguém dispara pelo cliente.",
      ready: true,
    },
  ];

export function triggerLabel(value?: string | null) {
  return TRIGGER_EVENTS.find((t) => t.value === value)?.label ?? (value ?? "—");
}

export const FOLLOWUP_STATUS_LABEL: Record<string, string> = {
  PENDING: "Pendente",
  SCHEDULED: "Agendado",
  PROCESSING: "Enviando",
  SENT: "Enviado",
  CANCELLED: "Cancelado",
  FAILED: "Falhou",
  SKIPPED: "Ignorado",
  WAITING_CONNECTION: "Aguardando WhatsApp",
};

export const MESSAGE_VARIABLES = [
  "{{nome}}",
  "{{primeiro_nome}}",
  "{{vendedor}}",
  "{{empresa}}",
  "{{produto}}",
  "{{data_compra}}",
];

export const WEEKDAYS = [
  { value: 1, label: "Segunda" },
  { value: 2, label: "Terça" },
  { value: 3, label: "Quarta" },
  { value: 4, label: "Quinta" },
  { value: 5, label: "Sexta" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

/** Substitui variáveis; variáveis desconhecidas viram texto vazio, nunca quebram o envio. */
export function renderTemplate(template: string, values: Record<string, string | null | undefined>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_, key: string) => {
    const value = values[key.toLowerCase()];
    return value ? String(value) : "";
  });
}

export function stateLabel(state?: string | null) {
  switch (state) {
    case "connected":
      return { label: "WhatsApp conectado", emoji: "🟢" };
    case "connecting":
      return { label: "Conectando", emoji: "🟡" };
    case "qrcode":
      return { label: "Aguardando leitura do QR Code", emoji: "🟠" };
    case "error":
      return { label: "Erro na conexão", emoji: "🔴" };
    case "disabled":
      return { label: "Desativado", emoji: "⚪" };
    default:
      return { label: "Desconectado", emoji: "🔴" };
  }
}
