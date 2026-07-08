import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

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
const PAGE_SIZE = 20;

function PipelineStatusPage() {
  const [items, setItems] = useState<FailedActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [sort, setSort] = useState<"desc" | "asc">("desc");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    let q = supabase
      .from("pipeline_activities" as never)
      .select("id,deal_id,type,created_at,payload", { count: "exact" })
      .in("type", FAILED_TYPES)
      .order("created_at", { ascending: sort === "asc" })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);
    if (from) q = q.gte("created_at", new Date(from).toISOString());
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      q = q.lte("created_at", end.toISOString());
    }
    const { data, count, error: qErr } = await q;
    if (qErr) {
      setError(qErr.message);
      toast.error("Falha ao carregar status", { description: qErr.message });
    } else {
      setItems(((data as never) || []) as FailedActivity[]);
      setTotal(count ?? 0);
    }
    setLoading(false);
  };

  useEffect(() => { setPage(0); }, [from, to, sort]);
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to, sort, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageShell
      title="Status de Automações"
      description="Tarefas que falharam ao mover cartões no pipeline, com mensagem de erro e detalhes técnicos."
      icon={<AlertTriangle className="h-6 w-6" />}
      status={items.length > 0 ? ("beta" as const) : ("ativo" as const)}
      actions={
        <Button variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Atualizar
        </Button>
      }
    >
      <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_180px_auto] sm:items-end">
        <div className="space-y-1">
          <Label htmlFor="from" className="text-xs">De</Label>
          <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="to" className="text-xs">Até</Label>
          <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Ordenar</Label>
          <Select value={sort} onValueChange={(v) => setSort(v as "asc" | "desc")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="desc">Mais recentes</SelectItem>
              <SelectItem value="asc">Mais antigas</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(from || to) && (
          <Button variant="ghost" onClick={() => { setFrom(""); setTo(""); }}>Limpar</Button>
        )}
      </div>
      {loading ? (
        <div className="flex flex-col items-center gap-2 py-24 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="text-sm">Carregando falhas…</span>
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-6 text-center space-y-3">
          <AlertTriangle className="mx-auto h-6 w-6 text-destructive" />
          <div className="text-sm font-medium text-destructive">Erro ao buscar dados</div>
          <div className="text-xs text-muted-foreground break-words">{error}</div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4" /> Tentar novamente
          </Button>
        </div>
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
      {total > PAGE_SIZE && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {total} falha{total === 1 ? "" : "s"} · página {page + 1} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>
              Anterior
            </Button>
            <Button variant="outline" size="sm" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((p) => p + 1)}>
              Próxima
            </Button>
          </div>
        </div>
      )}
    </PageShell>
  );
}