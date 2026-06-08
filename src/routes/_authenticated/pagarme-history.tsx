import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, CreditCard, CheckCircle2, XCircle, Clock } from "lucide-react";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pagarme-history")({
  component: PagarmeHistoryPage,
});

function PagarmeHistoryPage() {
  const [search, setSearch] = useState("");

  const { data: webhooks, isLoading } = useQuery({
    queryKey: ["pagarme-webhooks-history"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagarme_webhooks")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const getStatusBadge = (eventType: string) => {
    switch (eventType) {
      case "order.paid":
        return <Badge className="bg-green-500 hover:bg-green-600"><CheckCircle2 className="w-3 h-3 mr-1" /> Pago</Badge>;
      case "order.canceled":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Cancelado</Badge>;
      case "order.created":
        return <Badge variant="outline" className="text-blue-500 border-blue-200 bg-blue-50"><Clock className="w-3 h-3 mr-1" /> Criado</Badge>;
      case "order.payment_failed":
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" /> Falhou</Badge>;
      default:
        return <Badge variant="secondary">{eventType}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Histórico Pagar.me</h1>
          <p className="text-muted-foreground">Acompanhe confirmações de pagamento via cartão/PIX</p>
        </div>
        <div className="bg-emerald-100 p-2 rounded-lg border border-emerald-200">
          <CreditCard className="w-6 h-6 text-emerald-600" />
        </div>
      </div>

      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-emerald-600" />
            Pagamentos Recebidos (Webhook)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data/Hora</TableHead>
                <TableHead>ID Pagar.me</TableHead>
                <TableHead>Evento</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Método</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto text-emerald-600" />
                    <span className="text-sm text-muted-foreground mt-2 block">Carregando histórico...</span>
                  </TableCell>
                </TableRow>
              )}
              {!isLoading && webhooks?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                    Nenhum pagamento registrado ainda.
                  </TableCell>
                </TableRow>
              )}
              {webhooks?.map((webhook: any) => {
                const payload = webhook.payload || {};
                const data = payload.data || {};
                const amount = data.amount ? data.amount / 100 : 0;
                const method = data.charges?.[0]?.payment_method || "—";
                
                return (
                  <TableRow key={webhook.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(webhook.created_at, true)}</TableCell>
                    <TableCell className="font-mono text-xs">{webhook.pagarme_id || "—"}</TableCell>
                    <TableCell className="capitalize">{webhook.event_type?.replace(/\./g, ' ')}</TableCell>
                    <TableCell>{getStatusBadge(webhook.event_type)}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {amount > 0 ? formatCurrency(amount) : "—"}
                    </TableCell>
                    <TableCell className="uppercase text-xs font-medium">{method}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
