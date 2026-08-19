import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { KanbanPersonAvatar } from "./person-avatar";
import { getOverdueProductions } from "./overdue";
import type { KanbanCardData, KanbanColumnData } from "./types";

interface OverdueAttentionBoardProps {
  cards: KanbanCardData[];
  columns: KanbanColumnData[];
  loading?: boolean;
  onLocate: (card: KanbanCardData) => void;
}

const severityStyle = {
  warning: {
    border: "border-amber-400/50",
    badge: "bg-amber-400/15 text-amber-600 dark:text-amber-300",
    dot: "bg-amber-400",
    label: "Atenção",
  },
  high: {
    border: "border-orange-500/55",
    badge: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
    dot: "bg-orange-500",
    label: "Alto",
  },
  critical: {
    border: "border-red-500/60",
    badge: "bg-red-500/15 text-red-600 dark:text-red-300",
    dot: "bg-red-500",
    label: "Crítico",
  },
} as const;

export function OverdueAttentionBoard({
  cards,
  columns,
  loading = false,
  onLocate,
}: OverdueAttentionBoardProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [perPage, setPerPage] = useState(1);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const overdue = useMemo(() => getOverdueProductions(cards, columns), [cards, columns]);
  const pageCount = Math.max(1, Math.ceil(overdue.length / perPage));
  const criticalCount = overdue.filter((item) => item.severity === "critical").length;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const update = () => {
      const width = node.clientWidth;
      setPerPage(width >= 1050 ? 3 : width >= 680 ? 2 : 1);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setPage((current) => Math.min(current, pageCount - 1)), [pageCount]);

  useEffect(() => {
    if (paused || pageCount <= 1) return;
    const timer = window.setInterval(() => setPage((current) => (current + 1) % pageCount), 5000);
    return () => window.clearInterval(timer);
  }, [pageCount, paused]);

  const visible = overdue.slice(page * perPage, page * perPage + perPage);

  return (
    <section
      ref={containerRef}
      className="relative mt-6 overflow-hidden rounded-2xl border border-border/60 bg-background/65 p-4 shadow-inner backdrop-blur-sm"
      aria-label="Produções em atraso"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/15 text-amber-500">
            <AlertTriangle className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-extrabold tracking-tight sm:text-base">
              Atenção — Produções em atraso
            </h2>
            <p className="text-[11px] text-muted-foreground">
              Prazo ultrapassado há mais de 3 dias
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-bold">
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-600 dark:text-amber-300">
            {overdue.length} atrasada{overdue.length === 1 ? "" : "s"}
          </span>
          {criticalCount > 0 && (
            <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-red-600 dark:text-red-300">
              {criticalCount} crítica{criticalCount === 1 ? "" : "s"}
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((item) => (
            <div key={item} className="h-32 animate-pulse rounded-xl bg-muted/70" />
          ))}
        </div>
      ) : overdue.length === 0 ? (
        <div className="flex min-h-24 items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/5 px-4 text-center text-sm font-medium text-emerald-600 dark:text-emerald-300">
          Nenhuma produção com mais de 3 dias de atraso.
        </div>
      ) : (
        <>
          <div
            key={`${page}-${perPage}`}
            className="grid animate-in fade-in slide-in-from-right-4 gap-3 duration-500"
            style={{ gridTemplateColumns: `repeat(${perPage}, minmax(0, 1fr))` }}
          >
            {visible.map((item) => {
              const style = severityStyle[item.severity];
              const producer = item.card.producer ?? item.card.sales?.producers;
              return (
                <button
                  key={item.card.id}
                  type="button"
                  onClick={() => onLocate(item.card)}
                  className={cn(
                    "group min-w-0 rounded-xl border bg-card/90 p-3 text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    style.border,
                  )}
                >
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-extrabold">{item.card.title}</div>
                      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        Cliente: {item.card.sales?.customers?.name ?? "Não informado"}
                      </div>
                    </div>
                    <span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-extrabold", style.badge)}>
                      <span className={cn("mr-1 inline-block h-1.5 w-1.5 rounded-full", style.dot)} />
                      {style.label}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 rounded-lg bg-muted/55 px-2.5 py-2">
                    <KanbanPersonAvatar
                      bucket="producer-avatars"
                      name={producer?.name}
                      value={producer?.avatar_url}
                      className="h-9 w-9"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <User className="h-3 w-3" /> Produtor responsável
                      </div>
                      <div className="truncate text-sm font-black text-foreground">
                        {producer?.name ?? "Sem produtor"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1 text-muted-foreground">
                        <CalendarDays className="h-3 w-3" /> Entrega
                      </div>
                      <div className="font-bold">{fmtDate(item.deliveryDate)}</div>
                    </div>
                    <div className="text-right">
                      <div className="truncate text-muted-foreground">{item.column.name}</div>
                      <div className={cn("font-black", style.badge.split(" ")[1])}>
                        {item.daysLate} dias de atraso
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {pageCount > 1 && (
            <div className="mt-3 flex items-center justify-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="Atrasos anteriores"
                onClick={() => setPage((current) => (current - 1 + pageCount) % pageCount)}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <div className="flex items-center gap-1.5">
                {Array.from({ length: pageCount }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    aria-label={`Ir para grupo ${index + 1}`}
                    onClick={() => setPage(index)}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      index === page ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/35",
                    )}
                  />
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-7 w-7 rounded-full"
                aria-label="Próximos atrasos"
                onClick={() => setPage((current) => (current + 1) % pageCount)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
