import { Button } from "@/components/ui/button";
import { Layers, Plus } from "lucide-react";
import type { ReactNode } from "react";

export interface KanbanHeaderProps {
  onNewColumn: () => void;
  attentionPanel?: ReactNode;
}

export function KanbanHeader({ onNewColumn, attentionPanel }: KanbanHeaderProps) {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"
      style={{ boxShadow: "0 10px 40px -12px oklch(0.55 0.20 25 / 0.35)" }}
    >
      <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
            <Layers className="h-3.5 w-3.5" /> Produção
          </div>
          <h1 className="truncate bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
            Kanban de Produção
          </h1>
          <p className="text-sm text-muted-foreground">
            Arraste os cards entre as colunas para atualizar o status
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium text-emerald-500 sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" /> Ao vivo
          </span>
          <Button variant="premium" onClick={onNewColumn} className="gap-2">
            <Plus className="w-4 h-4" /> Nova Coluna
          </Button>
        </div>
      </div>
      <div className="relative">{attentionPanel}</div>
    </div>
  );
}
