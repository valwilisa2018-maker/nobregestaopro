import { useRef } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Pencil, Trash2, Check, ExternalLink, Link2, Receipt } from "lucide-react";
import { formatCurrency, fmtDate } from "@/lib/format";
import { VirtualTableRows } from "@/components/virtual-list";
import { TableSkeletonRows, TableEmptyRow } from "@/components/list-states";
import { SaleReceiptDialog } from "./SaleReceiptDialog";
import type { SaleRecord } from "./types";

export interface SalesTableViewProps {
  loadingSales: boolean;
  salesError: unknown;
  filteredSales: SaleRecord[];
  onRefetch: () => void;
  statusVariant: (status: string) => "default" | "secondary" | "destructive";
  onGenerateLink: (sale: SaleRecord) => void;
  onEdit: (sale: SaleRecord) => void;
  onDelete: (id: string) => void;
  onQuickConfirm: (sale: SaleRecord) => void;
}

export function SalesTableView({
  loadingSales,
  salesError,
  filteredSales,
  onRefetch,
  statusVariant,
  onGenerateLink,
  onEdit,
  onDelete,
  onQuickConfirm,
}: SalesTableViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-0">
        <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
          <Table>
          <TableHeader className="sticky top-0 z-10 bg-card">
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Cliente</TableHead>
              <TableHead>Serviço</TableHead>
              <TableHead>Vendedor</TableHead>
              <TableHead>Produtor</TableHead>
              <TableHead className="text-right">Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingSales && <TableSkeletonRows rows={8} columns={8} />}
            {!!salesError && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-12 text-destructive">
                  <p>Ocorreu um erro ao carregar as vendas.</p>
                  <p className="text-xs mt-1 mb-2">
                    {(salesError as { message?: string })?.message || "Erro desconhecido"}
                  </p>
                  <Button variant="outline" size="sm" className="mt-2" onClick={onRefetch}>
                    Tentar novamente
                  </Button>
                </TableCell>
              </TableRow>
            )}
            {!loadingSales && !salesError && (
              <VirtualTableRows
                items={filteredSales}
                scrollRef={scrollRef}
                colSpan={8}
                estimateSize={68}
                keyFor={(s) => s.id}
                renderRow={(s) => (
                  <TableRow>
                  <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                  <TableCell>
                    <div className="font-semibold text-base">{s.customers?.company || "—"}</div>
                    <div className="text-xs text-muted-foreground">{s.customers?.name}</div>
                  </TableCell>
                  <TableCell>{s.service_types?.name ?? "—"}</TableCell>
                  <TableCell>{s.sellers?.name ?? "—"}</TableCell>
                  <TableCell>{s.producers?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">
                    {formatCurrency(s.total_amount)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusVariant(s.payment_status)}>
                      {String(s.payment_status ?? "—").replace("_", " ")}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {(s.google_drive_link || s.trello_link) && (
                        <a
                          href={s.google_drive_link || s.trello_link || undefined}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir Google Drive"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                      {s.platform_link && (
                        <a
                          href={s.platform_link}
                          target="_blank"
                          rel="noreferrer"
                          title="Abrir link da plataforma"
                          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                        >
                          <Link2 className="w-4 h-4" />
                        </a>
                      )}
                      {s.payment_method === "cartao" && !s.pagarme_id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          title="Gerar Link Pagar.me"
                          onClick={() => onGenerateLink(s)}
                        >
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" onClick={() => onEdit(s)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => onDelete(s.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      {s.payment_status !== "pago_total" && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          title="Confirmar Pagamento"
                          onClick={() => onQuickConfirm(s)}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <SaleReceiptDialog sale={s} statusVariant={statusVariant} />
                    </div>
                  </TableCell>
                  </TableRow>
                )}
              />
            )}
            {!loadingSales && !salesError && filteredSales.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                  Nenhuma venda cadastrada ainda
                </TableCell>
              </TableRow>
            )}
          </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
