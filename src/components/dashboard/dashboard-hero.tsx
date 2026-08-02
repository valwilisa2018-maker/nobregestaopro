import { Sparkles } from "lucide-react";

export function DashboardHero() {
  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"
      style={{ boxShadow: "0 10px 40px -12px oklch(0.55 0.20 25 / 0.35)" }}
    >
      <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-16 w-64 h-64 rounded-full bg-info/15 blur-3xl pointer-events-none" />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="w-3.5 h-3.5" />
            Visão Geral
          </div>
          <h1 className="mt-3 text-3xl sm:text-4xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendas, produção e faturamento — atualizado em tempo real
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-semibold text-emerald-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
          </span>
          Ao vivo
        </div>
      </div>
    </div>
  );
}
