import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/services-todo")({
  component: () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState("");
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
    const filtered = useMemo(() => {
      const t = query.trim().toLowerCase();
      if (!t) return q.data ?? [];
      return (q.data ?? []).filter((o: any) => {
        const name = o.sales?.customers?.name?.toLowerCase() ?? "";
        const company = o.sales?.customers?.company?.toLowerCase() ?? "";
        return name.includes(t) || company.includes(t);
      });
    }, [q.data, query]);
    return (
      <div className="space-y-6">
        <div><h1 className="text-3xl font-bold tracking-tight">Serviços a Fazer</h1><p className="text-muted-foreground">Atualiza automaticamente conforme o Kanban</p></div>
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por cliente ou empresa…"
            value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Cliente</TableHead><TableHead>Serviço</TableHead><TableHead>Produtor</TableHead>
              <TableHead>Coluna</TableHead><TableHead>Prazo</TableHead><TableHead>Prioridade</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {filtered.map((o: any) => (
                <TableRow key={o.id} className="cursor-pointer hover:bg-muted/40"
                  onClick={() => navigate({ to: "/kanban", search: { card: o.id } as any })}>
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
              {filtered.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum serviço encontrado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});