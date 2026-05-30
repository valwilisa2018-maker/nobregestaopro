import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/customers")({
  component: () => {
    const q = useQuery({
      queryKey: ["customers-all"],
      queryFn: async () => {
        const { data } = await supabase.from("customers").select("*, sales(total_amount, paid_amount)").order("created_at", { ascending: false });
        return data ?? [];
      },
    });
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">Histórico completo de clientes e contratos</p></div>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Cliente</TableHead><TableHead>Empresa</TableHead>
                <TableHead>Documento</TableHead><TableHead>Contato</TableHead>
                <TableHead className="text-right">Vendas</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {(q.data ?? []).map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.company ?? "—"}</TableCell>
                    <TableCell>{c.document ?? "—"}</TableCell>
                    <TableCell><div className="text-sm">{c.phone}</div><div className="text-xs text-muted-foreground">{c.email}</div></TableCell>
                    <TableCell className="text-right">{c.sales?.length ?? 0}</TableCell>
                  </TableRow>
                ))}
                {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Sem clientes ainda</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  },
});