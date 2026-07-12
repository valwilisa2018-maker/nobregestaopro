import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, RefreshCw, Loader2, Inbox, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type LogRow = {
  id: string; level: string; source: string | null; message: string;
  metadata: Record<string, unknown> | null; created_at: string;
};

const LEVEL_STYLES: Record<string, string> = {
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warn: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  info: "bg-primary/15 text-primary border-primary/30",
  debug: "bg-muted text-muted-foreground border-border",
};

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>("all");
  const [search, setSearch] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
    if (level !== "all") q = q.eq("level", level);
    const { data, error } = await q;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as LogRow[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, level]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.message.toLowerCase().includes(term) ||
      (r.source ?? "").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const clearAll = async () => {
    if (!confirm("Limpar todos os logs? Esta ação é irreversível.")) return;
    if (!user) return;
    const { error } = await supabase.from("logs").delete().eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Logs limpos");
    load();
  };

  return (
    <PageShell
      title="Logs"
      description="Eventos técnicos gerados pela plataforma em tempo real."
      icon={<ScrollText className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" onClick={clearAll}><Trash2 className="h-4 w-4" /> Limpar</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input placeholder="Buscar mensagem ou origem…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Inbox className="h-6 w-6" /></div>
              <p className="text-muted-foreground">Nenhum log encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <div key={r.id} className="px-4 py-3 flex items-start gap-3 text-sm hover:bg-muted/30">
                  <Badge variant="outline" className={`shrink-0 ${LEVEL_STYLES[r.level] ?? ""}`}>{r.level}</Badge>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
                      {r.source && <span className="font-mono">· {r.source}</span>}
                    </div>
                    <div className="text-foreground break-words">{r.message}</div>
                    {r.metadata && Object.keys(r.metadata).length > 0 && (
                      <details className="mt-1">
                        <summary className="text-xs text-muted-foreground cursor-pointer">metadata</summary>
                        <pre className="mt-1 rounded bg-muted/50 p-2 text-xs overflow-x-auto"><code>{JSON.stringify(r.metadata, null, 2)}</code></pre>
                      </details>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
