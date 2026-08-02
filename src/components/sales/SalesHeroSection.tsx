import { Button } from "@/components/ui/button";
import { Loader2, LayoutGrid, List, ShoppingCart } from "lucide-react";
import { formatCurrency } from "@/lib/format";
import { NewSaleDialog, type NewSaleDialogProps } from "./NewSaleDialog";

export interface SalesHeroSectionProps {
  totalVendasHoje: number;
  viewMode: "table" | "card";
  onViewModeChange: (mode: "table" | "card") => void;
  isGeneratingLink: boolean;
  newSaleDialogProps: NewSaleDialogProps;
}

export function SalesHeroSection({
  totalVendasHoje,
  viewMode,
  onViewModeChange,
  isGeneratingLink,
  newSaleDialogProps,
}: SalesHeroSectionProps) {
  return (
    <>
      <div
        role="alert"
        className="rounded-md border border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2"
      >
        <span aria-hidden className="text-lg leading-none">
          ⚠️
        </span>
        <div>
          <strong className="font-semibold">Atenção:</strong> confirme se a venda é{" "}
          <strong>Parcial</strong> ou <strong>Total</strong> para o sistema marcar o pagamento
          corretamente. Preencha <strong>todas as informações com cautela</strong> para evitar erros
          no faturamento, comissão e Kanban.
        </div>
      </div>
      <div
        className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"
        style={{ boxShadow: "0 10px 40px -12px oklch(0.55 0.20 25 / 0.35)" }}
      >
        <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-24 h-64 w-64 rounded-full bg-primary/10 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 hidden lg:flex items-center justify-center">
          <div className="pointer-events-auto text-center">
            <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Vendas de hoje
            </div>
            <div className="mt-1 bg-gradient-to-br from-primary to-primary/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl tabular-nums">
              {formatCurrency(totalVendasHoje)}
            </div>
          </div>
        </div>
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:flex-wrap sm:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground backdrop-blur">
              <ShoppingCart className="h-3.5 w-3.5" /> Comercial
            </div>
            <h1 className="truncate bg-gradient-to-br from-foreground to-foreground/70 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Vendas
            </h1>
            <p className="text-sm text-muted-foreground">Cadastre e acompanhe todas as vendas</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {isGeneratingLink && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
                <Loader2 className="w-4 h-4 animate-spin" />
                Gerando link Pagar.me...
              </div>
            )}
            <div className="flex items-center bg-muted rounded-lg p-1 mr-2">
              <Button
                variant={viewMode === "table" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onViewModeChange("table")}
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "card" ? "secondary" : "ghost"}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => onViewModeChange("card")}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
            <NewSaleDialog {...newSaleDialogProps} />
          </div>
        </div>
      </div>
    </>
  );
}
