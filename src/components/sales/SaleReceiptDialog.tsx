import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, History, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { formatCurrency, fmtDate } from "@/lib/format";
import type { SaleRecord } from "./types";

export interface SaleReceiptDialogProps {
  sale: SaleRecord;
  triggerSize?: "icon";
  triggerVariant?: "ghost" | "outline";
  triggerClassName?: string;
  statusVariant: (status: string) => "default" | "secondary" | "destructive";
}

export function SaleReceiptDialog({
  sale,
  triggerVariant = "ghost",
  triggerClassName,
  statusVariant,
}: SaleReceiptDialogProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="icon" variant={triggerVariant} className={triggerClassName}>
          <Eye className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Histórico de Pagamentos e Comprovantes</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="flex justify-between items-center pb-2 border-bottom">
            <div>
              <h3 className="font-semibold text-lg">{sale.customers?.company || "—"}</h3>
              <p className="text-xs text-muted-foreground">{sale.customers?.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Valor Total</p>
              <p className="font-bold text-lg">{formatCurrency(sale.total_amount)}</p>
            </div>
          </div>
          <Tabs defaultValue="receipts" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="receipts" className="flex gap-2">
                <FileText className="w-4 h-4" /> Comprovantes
              </TabsTrigger>
              <TabsTrigger value="history" className="flex gap-2">
                <History className="w-4 h-4" /> Resumo
              </TabsTrigger>
            </TabsList>
            <TabsContent value="receipts" className="mt-4">
              {sale.sale_receipts && sale.sale_receipts.length > 0 ? (
                <div className="space-y-3">
                  {sale.sale_receipts.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"
                    >
                      <div className="flex items-center gap-3">
                        <div className="bg-green-100 p-2 rounded-full">
                          <FileText className="w-4 h-4 text-green-700" />
                        </div>
                        <div>
                          <p className="font-medium">{formatCurrency(r.amount)}</p>
                          <p className="text-xs text-muted-foreground">
                            {fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-2"
                        onClick={async () => {
                          const { data } = await supabase.storage
                            .from("receipts")
                            .createSignedUrl(r.file_path, 3600);
                          if (data?.signedUrl) window.open(data.signedUrl, "_blank");
                          else toast.error("Não foi possível gerar o link do comprovante");
                        }}
                      >
                        <Download className="w-4 h-4" />
                        Ver
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground italic">
                  Nenhum comprovante anexado.
                </div>
              )}
            </TabsContent>
            <TabsContent value="history" className="mt-4">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 border rounded-lg bg-green-50">
                    <p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p>
                    <p className="text-xl font-bold text-green-800">
                      {formatCurrency(sale.paid_amount)}
                    </p>
                  </div>
                  <div className="p-3 border rounded-lg bg-red-50">
                    <p className="text-xs text-red-700 uppercase font-semibold">Pendente</p>
                    <p className="text-xl font-bold text-red-800">
                      {formatCurrency(Number(sale.total_amount) - Number(sale.paid_amount))}
                    </p>
                  </div>
                </div>
                <div className="p-3 border rounded-lg">
                  <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                    Status
                  </p>
                  <Badge variant={statusVariant(sale.payment_status)}>
                    {String(sale.payment_status ?? "—").replace("_", " ")}
                  </Badge>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {sale.delivery_deadline && (
                    <div className="p-3 border rounded-lg">
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                        Prazo de Entrega
                      </p>
                      <p className="text-sm">{sale.delivery_deadline}</p>
                    </div>
                  )}
                  {sale.expected_delivery_date && (
                    <div className="p-3 border rounded-lg">
                      <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                        Data de Entrega
                      </p>
                      <p className="text-sm">{fmtDate(sale.expected_delivery_date)}</p>
                    </div>
                  )}
                </div>
                {sale.notes && (
                  <div className="p-3 border rounded-lg">
                    <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">
                      Observações da Venda
                    </p>
                    <p className="text-sm">{sale.notes}</p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </DialogContent>
    </Dialog>
  );
}
