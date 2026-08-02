import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface HistoryRow {
  id: string;
  from_column_name: string | null;
  to_column_name: string | null;
  moved_by_email: string | null;
  created_at: string;
}

export interface CardHistoryProps {
  cardId: string;
}

// Histórico de movimentação do card no Kanban.
// Mostra toda a linha do tempo: quem moveu, de onde, para onde e quando.
export function CardHistory({ cardId }: CardHistoryProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["service-order-history", cardId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_order_history" as any)
        .select("id, from_column_name, to_column_name, moved_by_email, created_at")
        .eq("service_order_id", cardId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as HistoryRow[];
    },
    enabled: !!cardId,
  });
  return (
    <div className="mt-4 border-t pt-3">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        Histórico de movimentação
      </Label>
      {isLoading ? (
        <div className="text-xs text-muted-foreground mt-2 flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Carregando…
        </div>
      ) : !data || data.length === 0 ? (
        <div className="text-xs text-muted-foreground mt-2">Sem movimentações registradas.</div>
      ) : (
        <ol className="mt-2 space-y-2 max-h-56 overflow-y-auto pr-1">
          {data.map((h) => {
            const when = new Date(h.created_at);
            const dateStr = when.toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <li key={h.id} className="text-xs border-l-2 border-primary/40 pl-2">
                <div className="font-medium">
                  {h.from_column_name ? (
                    <>
                      <span className="text-muted-foreground">{h.from_column_name}</span>
                      <span className="mx-1">→</span>
                      <span>{h.to_column_name ?? "—"}</span>
                    </>
                  ) : (
                    <span>
                      Criado em <b>{h.to_column_name ?? "—"}</b>
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {dateStr}
                  {h.moved_by_email ? ` • ${h.moved_by_email}` : ""}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
