import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Pencil, Trash2, Check, Link2, Receipt } from "lucide-react";
import { formatCurrency, fmtDate } from "@/lib/format";
import { CardGridSkeleton, EmptyState } from "@/components/list-states";
import { SaleReceiptDialog } from "./SaleReceiptDialog";
import type { SaleRecord } from "./types";

export interface SalesCardViewProps {
  loadingSales: boolean;
  salesError: unknown;
  filteredSales: SaleRecord[];
  onRetry: () => void;
  statusVariant: (status: string) => "default" | "secondary" | "destructive";
  onGenerateLink: (sale: SaleRecord) => void;
  onEdit: (sale: SaleRecord) => void;
  onDelete: (id: string) => void;
  onQuickConfirm: (sale: SaleRecord) => void;
}

export function SalesCardView({
  loadingSales,
  salesError,
  filteredSales,
  onRetry,
  statusVariant,
  onGenerateLink,
  onEdit,
  onDelete,
  onQuickConfirm,
}: SalesCardViewProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {loadingSales && <CardGridSkeleton count={6} />}
      {!!salesError && (
        <div className="col-span-full py-20 text-center text-destructive">
          <p>Erro ao carregar vendas.</p>
          <Button variant="outline" className="mt-4" onClick={onRetry}>
            Tentar novamente
          </Button>
        </div>
      )}
      {!loadingSales &&
        !salesError &&
        filteredSales.map((s) => (
          <Card
            key={s.id}
            className="border-border/50 overflow-hidden hover:shadow-md transition-shadow"
          >
            <CardContent className="p-0">
              <div className="p-4 space-y-3">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-bold text-lg leading-tight">
                      {s.customers?.company || "—"}
                    </h3>
                    <p className="text-xs text-muted-foreground">{s.customers?.name}</p>
                  </div>
                  <Badge variant={statusVariant(s.payment_status)}>
                    {String(s.payment_status ?? "—").replace("_", " ")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Serviço</p>
                    <p className="font-medium truncate">{s.service_types?.name ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Data</p>
                    <p className="font-medium">{fmtDate(s.sale_date)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Vendedor</p>
                    <p className="font-medium truncate">{s.sellers?.name ?? s.seller_name_snapshot ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Produtor</p>
                    <p className="font-medium truncate">{s.producers?.name ?? s.producer_name_snapshot ?? "—"}</p>
                  </div>
                </div>
                <div className="pt-2 border-t flex justify-between items-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Valor Total</p>
                    <p className="text-lg font-bold text-primary">
                      {formatCurrency(s.total_amount)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    {s.payment_method === "cartao" && !s.pagarme_id && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50"
                        title="Gerar Link Pagar.me"
                        onClick={() => onGenerateLink(s)}
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8"
                      onClick={() => onEdit(s)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-8 w-8 text-destructive border-destructive/10 hover:bg-destructive/5"
                      onClick={() => onDelete(s.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                    {s.payment_status !== "pago_total" && (
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50"
                        title="Confirmar Pagamento"
                        onClick={() => onQuickConfirm(s)}
                      >
                        <Check className="w-4 h-4" />
                      </Button>
                    )}
                    <SaleReceiptDialog
                      sale={s}
                      statusVariant={statusVariant}
                      triggerVariant="outline"
                      triggerClassName="h-8 w-8"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      {!loadingSales && !salesError && filteredSales.length === 0 && (
        <EmptyState
          className="col-span-full py-16"
          icon={<Receipt className="h-5 w-5" />}
          title="Nenhuma venda encontrada"
          description="Ajuste os filtros de período/status ou cadastre uma nova venda para vê-la aqui."
        />
      )}
    </div>
  );
}
