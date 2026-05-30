import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/kanban")({
  component: KanbanPage,
});

function KanbanPage() {
  const qc = useQueryClient();
  const [dragging, setDragging] = useState<string | null>(null);

  const cols = useQuery({
    queryKey: ["kanban-cols"],
    queryFn: async () => (await supabase.from("kanban_columns").select("*").order("sort_order")).data ?? [],
  });

  const cards = useQuery({
    queryKey: ["kanban-cards"],
    queryFn: async () => {
      const { data } = await supabase
        .from("service_orders")
        .select("*, sales(total_amount, payment_status, customers(name,company), sellers(name), producers(name))")
        .order("sort_order");
      return data ?? [];
    },
  });

  const move = async (cardId: string, columnId: string) => {
    const { error } = await supabase
      .from("service_orders")
      .update({ column_id: columnId, delivered_at: null })
      .eq("id", cardId);
    if (error) toast.error(error.message);
    else { toast.success("Card movido"); qc.invalidateQueries({ queryKey: ["kanban-cards"] }); }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Produção Trello</h1>
        <p className="text-muted-foreground">Arraste os cards entre as colunas para atualizar o status</p>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-4">
        {(cols.data ?? []).map((col: any) => {
          const colCards = (cards.data ?? []).filter((c: any) => c.column_id === col.id);
          return (
            <div
              key={col.id}
              className="min-w-[280px] w-[280px] flex-shrink-0"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging) move(dragging, col.id); setDragging(null); }}
            >
              <div className="flex items-center justify-between mb-3 px-2">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: col.color }} />
                  <span className="font-semibold text-sm">{col.name}</span>
                </div>
                <Badge variant="outline">{colCards.length}</Badge>
              </div>
              <div className="space-y-2 min-h-[100px]">
                {colCards.map((c: any) => (
                  <Card key={c.id} draggable onDragStart={() => setDragging(c.id)}
                    className="cursor-grab active:cursor-grabbing border-border/60 hover:border-primary/40 transition-all"
                    style={{ boxShadow: "var(--shadow-card)" }}>
                    <CardContent className="p-3 space-y-2">
                      <div className="text-sm font-medium leading-tight">{c.title}</div>
                      {c.sales?.customers?.company && (
                        <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">{c.sales?.producers?.name ?? "—"}</span>
                        <Badge variant={c.sales?.payment_status === "pago_total" ? "default" : "destructive"} className="text-[10px]">
                          {c.sales?.payment_status?.replace("_"," ")}
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}