import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

export const Route = createFileRoute("/_authenticated/pipeline-status")({
  head: () => ({ meta: [{ title: "Status de Automações — Pipeline CRM" }] }),
  component: PipelineStatusPage,
});

type FailedActivity = {
  id: string;
  deal_id: string;
  type: string;
  created_at: string;
  payload: Record<string, unknown> | null;
};

const FAILED_TYPES = ["whatsapp_failed", "email_failed", "task_failed", "automation_failed"];

function PipelineStatusPage() {
  const [items, setItems] = useState<FailedActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pipeline_activities" as never)
      .select("id,deal_id,type,created_at,payload")
      .in("type", FAILED_TYPES)
      .order("created_at", { ascending: false })
      .limit(100);
    setItems(((data as never) || []) as FailedActivity[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  return (
    <PageShell
      title="Status de Automações"
      description="Tarefas que falharam ao mover cartões no pipeline, com mensagem de erro e detalhes técnicos."
      icon={<AlertTriangle className="h-6 w-6" />}
      status={items.length > 0 ? "beta" : "ativo"}
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      }
    >
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">
          Nenhuma tarefa com falha nos últimos registros. 🎉
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => {
            const p = it.payload || {};
            const error = (p.error as string | undefined) || "Erro desconhecido";
            const stack = p.stack as string | undefined;
            const to = p.to as string | undefined;
            const text = p.text as string | undefined;
            return (
              <div key={it.id} className="rounded-lg border bg-card p-4 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="destructive">{it.type}</Badge>
                  <span className="text-xs text-muted-foreground">
                    {formatDistanceToNow(new Date(it.created_at), { addSuffix: true, locale: ptBR })}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto">deal: {it.deal_id.slice(0, 8)}…</span>
                </div>
                <div className="text-sm font-medium text-destructive break-words">{error}</div>
                {to && <div className="text-xs text-muted-foreground">Destino: {to}</div>}
                {text && (
                  <div className="text-xs bg-muted/50 rounded p-2 whitespace-pre-wrap break-words">{text}</div>
                )}
                {stack && (
                  <details className="text-xs">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Stack trace</summary>
                    <pre className="mt-2 bg-muted/50 rounded p-2 overflow-x-auto whitespace-pre-wrap break-words">{stack}</pre>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}