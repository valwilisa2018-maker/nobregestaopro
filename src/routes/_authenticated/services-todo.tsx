import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/services-todo")({
  component: () => {
    const q = useQuery({
      queryKey: ["services-todo"],
      queryFn: async () => {
        const { data } = await supabase
          .from("service_orders")
          .select("*, kanban_columns(name,is_done,color), sales(customers(name,company), producers(name), service_types(name))")
          .order("due_date", { ascending: true });
        return (data ?? []).filter((o: any) => !o.kanban_columns?.is_done);
      },
    });
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Serviços a Fazer</h1><p className="text-muted-foreground">Atualiza automaticamente conforme o Kanban</p></div>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Serviço</TableHead><TableHead>Produtor</TableHead>
              <TableHead>Coluna</TableHead><TableHead>Prazo</TableHead><TableHead>Prioridade</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((o: any) => (
                <TableRow key={o.id}>
                  <TableCell>
                    <div className="font-medium">{o.sales?.customers?.name}</div>
                    <div className="text-xs text-muted-foreground">{o.sales?.customers?.company}</div>
                  </TableCell>
                  <TableCell>{o.sales?.service_types?.name ?? o.title}</TableCell>
                  <TableCell>{o.sales?.producers?.name ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="outline" style={{ borderColor: o.kanban_columns?.color, color: o.kanban_columns?.color }}>
                      {o.kanban_columns?.name}
                    </Badge>
                  </TableCell>
                  <TableCell>{o.due_date ?? "—"}</TableCell>
                  <TableCell>{o.priority === 1 ? "Alta" : o.priority === 2 ? "Média" : "Baixa"}</TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum serviço pendente</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});