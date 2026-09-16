import {
  AudioLines,
  CalendarClock,
  Clock,
  GitBranch,
  Image,
  Keyboard,
  ListOrdered,
  MessageCircleQuestion,
  MessageSquare,
  MessagesSquare,
  Mic,
  Play,
  Radio,
  Square,
  Tag,
  ToggleRight,
  UserCheck,
  UserSquare,
  Video,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowBlock, WorkflowBlockType } from "@/lib/workflow-shared";

export type BlockVisual = {
  icon: LucideIcon;
  /** Cor do ícone/borda do bloco no quadro. */
  accent: string;
  chip: string;
  ring: string;
};

function visual(icon: LucideIcon, tone: string): BlockVisual {
  return {
    icon,
    accent: `text-${tone}-400`,
    chip: `bg-${tone}-500/15 text-${tone}-300`,
    ring: `border-${tone}-500/40`,
  };
}

export const BLOCK_VISUAL: Record<WorkflowBlockType, BlockVisual> = {
  trigger: {
    icon: Play,
    accent: "text-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300",
    ring: "border-emerald-500/40",
  },
  send_message: {
    icon: MessageSquare,
    accent: "text-sky-400",
    chip: "bg-sky-500/15 text-sky-300",
    ring: "border-sky-500/40",
  },
  send_image: {
    icon: Image,
    accent: "text-pink-400",
    chip: "bg-pink-500/15 text-pink-300",
    ring: "border-pink-500/40",
  },
  send_video: {
    icon: Video,
    accent: "text-fuchsia-400",
    chip: "bg-fuchsia-500/15 text-fuchsia-300",
    ring: "border-fuchsia-500/40",
  },
  send_audio: {
    icon: AudioLines,
    accent: "text-violet-400",
    chip: "bg-violet-500/15 text-violet-300",
    ring: "border-violet-500/40",
  },
  typing: {
    icon: Keyboard,
    accent: "text-teal-400",
    chip: "bg-teal-500/15 text-teal-300",
    ring: "border-teal-500/40",
  },
  recording: {
    icon: Mic,
    accent: "text-red-400",
    chip: "bg-red-500/15 text-red-300",
    ring: "border-red-500/40",
  },
  question: {
    icon: MessageCircleQuestion,
    accent: "text-cyan-400",
    chip: "bg-cyan-500/15 text-cyan-300",
    ring: "border-cyan-500/40",
  },
  capture_name: {
    icon: UserSquare,
    accent: "text-indigo-400",
    chip: "bg-indigo-500/15 text-indigo-300",
    ring: "border-indigo-500/40",
  },
  wait_reply: {
    icon: MessagesSquare,
    accent: "text-emerald-400",
    chip: "bg-emerald-500/15 text-emerald-300",
    ring: "border-emerald-500/40",
  },
  condition: {
    icon: GitBranch,
    accent: "text-amber-400",
    chip: "bg-amber-500/15 text-amber-300",
    ring: "border-amber-500/40",
  },
  yes_no: {
    icon: ToggleRight,
    accent: "text-lime-400",
    chip: "bg-lime-500/15 text-lime-300",
    ring: "border-lime-500/40",
  },
  delay: {
    icon: Clock,
    accent: "text-violet-400",
    chip: "bg-violet-500/15 text-violet-300",
    ring: "border-violet-500/40",
  },
  tags: {
    icon: Tag,
    accent: "text-orange-400",
    chip: "bg-orange-500/15 text-orange-300",
    ring: "border-orange-500/40",
  },
  sequence: {
    icon: ListOrdered,
    accent: "text-blue-400",
    chip: "bg-blue-500/15 text-blue-300",
    ring: "border-blue-500/40",
  },
  schedule: {
    icon: CalendarClock,
    accent: "text-sky-400",
    chip: "bg-sky-500/15 text-sky-300",
    ring: "border-sky-500/40",
  },
  broadcast: {
    icon: Radio,
    accent: "text-rose-400",
    chip: "bg-rose-500/15 text-rose-300",
    ring: "border-rose-500/40",
  },
  webhook: {
    icon: Webhook,
    accent: "text-slate-300",
    chip: "bg-slate-500/15 text-slate-200",
    ring: "border-slate-500/40",
  },
  assign_seller: {
    icon: UserCheck,
    accent: "text-fuchsia-400",
    chip: "bg-fuchsia-500/15 text-fuchsia-300",
    ring: "border-fuchsia-500/40",
  },
  handoff: {
    icon: UserCheck,
    accent: "text-orange-400",
    chip: "bg-orange-500/15 text-orange-300",
    ring: "border-orange-500/40",
  },
  end: {
    icon: Square,
    accent: "text-rose-400",
    chip: "bg-rose-500/15 text-rose-300",
    ring: "border-rose-500/40",
  },
};

// Mantém a função utilitária disponível para novos blocos.
void visual;

/** Resumo curto mostrado dentro do bloco no quadro. */
export function blockSummary(block: WorkflowBlock) {
  switch (block.type) {
    case "trigger":
      return "Início do fluxo";
    case "send_message":
      return block.text?.trim() || "Escreva a mensagem";
    case "send_image":
      return block.mediaUrl?.trim() ? "Imagem pronta para enviar" : "Informe o link da imagem";
    case "send_video":
      return block.mediaUrl?.trim() ? "Vídeo pronto para enviar" : "Informe o link do vídeo";
    case "send_audio":
      return block.mediaUrl?.trim() ? "Áudio pronto para enviar" : "Informe o link do áudio";
    case "typing":
      return `Mostra “digitando...” por ${block.seconds ?? 3}s`;
    case "recording":
      return `Mostra “gravando...” por ${block.seconds ?? 3}s`;
    case "question":
      return block.text?.trim() || "Escreva a pergunta";
    case "capture_name":
      return block.text?.trim() || "Pergunta o nome do cliente";
    case "wait_reply":
      return `Espera a resposta por até ${block.timeoutMinutes ?? 1440} min`;
    case "delay":
      return `Aguarda ${block.waitMinutes ?? 60} min`;
    case "condition":
    case "yes_no":
      return (block.keywords ?? []).filter(Boolean).join(", ") || "Informe as palavras";
    case "tags":
      return (block.tags ?? []).filter(Boolean).join(", ") || "Informe as etiquetas";
    case "sequence":
      return `Etiqueta + espera resposta (${(block.tags ?? []).join(", ") || "sem etiqueta"})`;
    case "schedule":
      return block.text?.trim() || "Pede dia e horário";
    case "broadcast":
      return block.targetPhone?.trim()
        ? `Avisa ${block.targetPhone}`
        : "Informe o número do aviso";
    case "webhook":
      return block.url?.trim() || "Informe o endereço do webhook";
    case "assign_seller":
      return block.transferMode === "end_current"
        ? "Encerra este fluxo"
        : block.transferMode === "start_target"
          ? "Encaminha para o novo vendedor"
          : "Continua mantendo o dono";
    case "handoff":
      return "Alguém continua manualmente";
    case "end":
      return "Finaliza a conversa";
    default:
      return "";
  }
}
