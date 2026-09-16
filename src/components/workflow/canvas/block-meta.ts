import {
  Clock,
  GitBranch,
  MessageSquare,
  MessagesSquare,
  Play,
  Square,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import type { WorkflowBlockType } from "@/lib/workflow-shared";

export type BlockVisual = {
  icon: LucideIcon;
  /** Cor do ícone/borda do bloco no quadro. */
  accent: string;
  chip: string;
  ring: string;
};

export const BLOCK_VISUAL: Record<WorkflowBlockType, BlockVisual> = {
  send_message: {
    icon: MessageSquare,
    accent: "text-sky-400",
    chip: "bg-sky-500/15 text-sky-300",
    ring: "border-sky-500/40",
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
  delay: {
    icon: Clock,
    accent: "text-violet-400",
    chip: "bg-violet-500/15 text-violet-300",
    ring: "border-violet-500/40",
  },
  assign_seller: {
    icon: UserCheck,
    accent: "text-fuchsia-400",
    chip: "bg-fuchsia-500/15 text-fuchsia-300",
    ring: "border-fuchsia-500/40",
  },
  handoff: {
    icon: Play,
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

/** Resumo curto mostrado dentro do bloco no quadro. */
export function blockSummary(block: {
  type: WorkflowBlockType;
  text?: string;
  keywords?: string[];
  waitMinutes?: number;
  timeoutMinutes?: number;
  transferMode?: string;
}) {
  switch (block.type) {
    case "send_message":
      return block.text?.trim() || "Escreva a mensagem";
    case "wait_reply":
      return `Espera a resposta por até ${block.timeoutMinutes ?? 1440} min`;
    case "delay":
      return `Aguarda ${block.waitMinutes ?? 60} min`;
    case "condition":
      return (block.keywords ?? []).filter(Boolean).join(", ") || "Informe as palavras";
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
