import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo, Fragment } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ChevronRight, ChevronDown } from "lucide-react";
import { fmtDate } from "@/lib/format";

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
    const grouped = useMemo(() => {
      const map = new Map<string, { key: string; name: string; company: string; items: any[] }>();
      for (const o of filtered) {
        const name = o.sales?.customers?.name ?? "—";
        const company = o.sales?.customers?.company ?? "";
        const key = `${name}||${company}`;
        if (!map.has(key)) map.set(key, { key, name, company, items: [] });
        map.get(key)!.items.push(o);
      }
      return Array.from(map.values());
    }, [filtered]);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
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
              {grouped.map((g) => {
                const multi = g.items.length > 1;
                const isOpen = !!expanded[g.key];
                const first = g.items[0];
                const onRowClick = () => {
                  if (multi) setExpanded((s) => ({ ...s, [g.key]: !s[g.key] }));
                  else navigate({ to: "/kanban", search: { card: first.id } as any });
                };
                return (
                  <Fragment key={g.key}>
                    <TableRow key={g.key} className="cursor-pointer hover:bg-muted/40" onClick={onRowClick}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {multi ? (isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : <span className="w-4" />}
                          <div>
                            <div className="font-medium">{g.name} {multi && <span className="text-xs text-muted-foreground font-normal">({g.items.length})</span>}</div>
                            <div className="text-xs text-muted-foreground">{g.company}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>{multi ? `${g.items.length} serviços` : (first.sales?.service_types?.name ?? first.title)}</TableCell>
                      <TableCell>{first.sales?.producers?.name ?? "—"}</TableCell>
                      <TableCell>
                        {!multi && (
                          <Badge variant="outline" style={{ borderColor: first.kanban_columns?.color, color: first.kanban_columns?.color }}>
                            {first.kanban_columns?.name}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{!multi ? fmtDate(first.due_date) : "—"}</TableCell>
                      <TableCell>{!multi ? (first.priority === 1 ? "Alta" : first.priority === 2 ? "Média" : "Baixa") : "—"}</TableCell>
                    </TableRow>
                    {multi && isOpen && g.items.map((o: any) => (
                      <TableRow key={o.id} className="cursor-pointer bg-muted/20 hover:bg-muted/40"
                        onClick={() => navigate({ to: "/kanban", search: { card: o.id } as any })}>
                        <TableCell className="pl-10 text-xs text-muted-foreground">↳</TableCell>
                        <TableCell>{o.sales?.service_types?.name ?? o.title}</TableCell>
                        <TableCell>{o.sales?.producers?.name ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant="outline" style={{ borderColor: o.kanban_columns?.color, color: o.kanban_columns?.color }}>
                            {o.kanban_columns?.name}
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(o.due_date)}</TableCell>
                        <TableCell>{o.priority === 1 ? "Alta" : o.priority === 2 ? "Média" : "Baixa"}</TableCell>
                      </TableRow>
                    ))}
                  </Fragment>
                );
              })}
              {grouped.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum serviço encontrado</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});