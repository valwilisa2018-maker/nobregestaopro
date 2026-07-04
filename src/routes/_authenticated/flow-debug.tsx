import { createFileRoute } from "@tanstack/react-router";
import { Bug, RefreshCw, Loader2, Inbox } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/flow-debug")({
  head: () => ({ meta: [{ title: "Debug de Fluxo — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type FlowState = {
  flow_id?: string;
  current_node?: string | null;
  awaiting?: { node_id: string; variable?: string } | null;
  variables?: Record<string, string>;
  finished?: boolean;
};
type Row = {
  id: string;
  connection_id: string | null;
  metadata: { remoteJid?: string } | null;
  flow_state: FlowState | null;
  last_message_at: string | null;
  updated_at: string | null;
};
type FlowMeta = { id: string; name: string; definition: { nodes?: Array<{ id: string; data?: { label?: string; kind?: string } }> } };

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [flows, setFlows] = useState<Record<string, FlowMeta>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [onlyActive, setOnlyActive] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("conversations")
      .select("id,connection_id,metadata,flow_state,last_message_at,updated_at")
      .eq("user_id", user.id)
      .not("flow_state", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (error) { setLoading(false); return toast.error(error.message); }
    const list = (data ?? []) as Row[];
    setRows(list);
    const ids = Array.from(new Set(list.map((r) => r.flow_state?.flow_id).filter(Boolean))) as string[];
    if (ids.length) {
      const { data: fdata } = await supabase.from("flows").select("id,name,definition").in("id", ids);
      const map: Record<string, FlowMeta> = {};
      for (const f of (fdata ?? []) as FlowMeta[]) map[f.id] = f;
      setFlows(map);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); /* eslint-disable-next-line */ }, [user]);

  // Realtime updates on conversations
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`flow-debug:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations", filter: `user_id=eq.${user.id}` }, (payload) => {
        const newRow = payload.new as Row | null;
        const oldRow = payload.old as Row | null;
        const id = newRow?.id ?? oldRow?.id;
        if (!id) return;
        setRows((prev) => {
          if (!newRow || !newRow.flow_state) return prev.filter((r) => r.id !== id);
          const others = prev.filter((r) => r.id !== id);
          return [newRow, ...others].slice(0, 200);
        });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && (r.flow_state?.finished || !r.flow_state?.current_node && !r.flow_state?.awaiting)) return false;
      if (!term) return true;
      const jid = r.metadata?.remoteJid ?? "";
      const fname = flows[r.flow_state?.flow_id ?? ""]?.name ?? "";
      return jid.toLowerCase().includes(term) || fname.toLowerCase().includes(term);
    });
  }, [rows, search, onlyActive, flows]);

  const nodeLabel = (flowId: string | undefined, nodeId: string | null | undefined) => {
    if (!flowId || !nodeId) return null;
    const n = flows[flowId]?.definition?.nodes?.find((x) => x.id === nodeId);
    return n ? `${n.data?.kind ?? "?"}${n.data?.label ? ` · ${n.data.label}` : ""}` : nodeId;
  };

  return (
    <PageShell
      title="Debug de Fluxo"
      description="Estado do fluxo por conversa em tempo real (nó atual, variáveis, aguardando resposta)."
      icon={<Bug className="h-6 w-6" />}
      status="ativo"
      actions={
        <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input placeholder="Buscar por telefone ou nome do fluxo…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" checked={onlyActive} onChange={(e) => setOnlyActive(e.target.checked)} />
          Só ativos
        </label>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Inbox className="h-6 w-6" /></div>
              <p className="text-muted-foreground">Nenhuma conversa com fluxo em execução.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => {
                const st = r.flow_state ?? {};
                const fname = flows[st.flow_id ?? ""]?.name ?? st.flow_id ?? "—";
                const current = nodeLabel(st.flow_id, st.current_node);
                const waiting = st.awaiting ? nodeLabel(st.flow_id, st.awaiting.node_id) : null;
                return (
                  <div key={r.id} className="px-4 py-3 text-sm hover:bg-muted/30">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="font-mono">{(r.metadata?.remoteJid ?? "").split("@")[0] || "—"}</Badge>
                      <span className="font-medium">{fname}</span>
                      {st.finished ? (
                        <Badge className="bg-muted text-muted-foreground">finalizado</Badge>
                      ) : waiting ? (
                        <Badge className="bg-yellow-500/15 text-yellow-600 border-yellow-500/30" variant="outline">aguardando: {waiting}{st.awaiting?.variable ? ` → ${st.awaiting.variable}` : ""}</Badge>
                      ) : current ? (
                        <Badge className="bg-primary/15 text-primary border-primary/30" variant="outline">nó atual: {current}</Badge>
                      ) : (
                        <Badge variant="outline">ocioso</Badge>
                      )}
                      <span className="ml-auto text-xs text-muted-foreground">{r.last_message_at ? new Date(r.last_message_at).toLocaleString("pt-BR") : ""}</span>
                    </div>
                    {st.variables && Object.keys(st.variables).length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer">variáveis ({Object.keys(st.variables).length})</summary>
                        <pre className="mt-1 rounded bg-muted/50 p-2 text-xs overflow-x-auto"><code>{JSON.stringify(st.variables, null, 2)}</code></pre>
                      </details>
                    )}
                    <details className="mt-1">
                      <summary className="text-xs text-muted-foreground cursor-pointer">flow_state (raw)</summary>
                      <pre className="mt-1 rounded bg-muted/50 p-2 text-xs overflow-x-auto"><code>{JSON.stringify(st, null, 2)}</code></pre>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}