import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: () => {
    const q = useQuery({
      queryKey: ["invoices"],
      queryFn: async () => (await supabase.from("invoices").select("*, customers(name)").order("created_at", { ascending: false })).data ?? [],
    });
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Notas Fiscais</h1><p className="text-muted-foreground">Controle fiscal por cliente</p></div>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Número</TableHead><TableHead>Cliente</TableHead><TableHead>Valor</TableHead><TableHead>Emissão</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((i: any) => (
                <TableRow key={i.id}>
                  <TableCell>{i.number ?? "—"}</TableCell>
                  <TableCell>{i.customers?.name}</TableCell>
                  <TableCell>{formatCurrency(i.amount)}</TableCell>
                  <TableCell>{i.issued_at ?? "—"}</TableCell>
                  <TableCell><Badge variant={i.status === "emitida" ? "default" : i.status === "cancelada" ? "destructive" : "secondary"}>{i.status}</Badge></TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem notas fiscais. Você pode liberar este módulo para o financeiro adicionar emissões.</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});