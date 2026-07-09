import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, RefreshCw, Play, Power, Trash2, QrCode, CheckCircle2, XCircle, Activity, Webhook } from "lucide-react";
import { toast } from "sonner";
import { testConnection, connectInstance, disconnectInstance, testWebhook } from "@/lib/evolution.functions";
import { MasterGuard } from "@/components/master-guard";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Conexões — Plataforma IA WhatsApp" }] }),
  component: () => <MasterGuard><ConnectionsPage /></MasterGuard>,
});

type Connection = {
  id: string; name: string; description: string | null; provider: string;
  url_api: string; api_key: string; instance_name: string; status: string;
  phone_number: string | null; profile_name: string | null; profile_picture: string | null;
  notes: string | null; message_count: number; consumption: number; last_sync: string | null;
  created_at: string;
  metadata: { flow_timeout_hours?: number } | null;
};

function statusBadge(status: string) {
  const map: Record<string, string> = {
    online: "bg-green-500/15 text-green-600 border-green-500/30",
    connecting: "bg-yellow-500/15 text-yellow-600 border-yellow-500/30",
    offline: "bg-gray-500/15 text-gray-500 border-gray-500/30",
  };
  return <Badge variant="outline" className={map[status] || map.offline}>{status}</Badge>;
}

function ConnectionsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [qr, setQr] = useState<{ open: boolean; data: string | null; name: string }>({ open: false, data: null, name: "" });
  const [form, setForm] = useState({ name: "", description: "", url_api: "", api_key: "", instance_name: "", notes: "" });

  type Diag = { ok: boolean; action: string; message: string; details?: string; at: string };
  const [diagnostics, setDiagnostics] = useState<Record<string, Diag>>({});
  const [busy, setBusy] = useState<Record<string, string | null>>({});

  const setDiag = (id: string, d: Diag) => setDiagnostics((prev) => ({ ...prev, [id]: d }));
  const setBusyFor = (id: string, action: string | null) => setBusy((prev) => ({ ...prev, [id]: action }));

  const testFn = useServerFn(testConnection);
  const connectFn = useServerFn(connectInstance);
  const disconnectFn = useServerFn(disconnectInstance);
  const testWebhookFn = useServerFn(testWebhook);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.from("connections").select("*").order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    else setItems((data ?? []) as Connection[]);
    setLoading(false);
  };

  useEffect(() => { if (user) load(); }, [user]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("connections").insert({ ...form, user_id: user.id, provider: "evolution" });
    if (error) return toast.error(error.message);
    toast.success("Conexão criada");
    setOpen(false);
    setForm({ name: "", description: "", url_api: "", api_key: "", instance_name: "", notes: "" });
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta conexão?")) return;
    const { error } = await supabase.from("connections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Conexão removida");
    load();
  };

  const doTest = async (c: Connection) => {
    setBusyFor(c.id, "test");
    try {
      const r = await testFn({ data: { connectionId: c.id } });
      setDiag(c.id, { ok: true, action: "Testar", message: `Estado: ${r.state}`, details: JSON.stringify(r, null, 2), at: new Date().toISOString() });
      toast.success(`Estado: ${r.state}`);
      load();
    } catch (e: any) {
      setDiag(c.id, { ok: false, action: "Testar", message: e?.message ?? "Falha ao testar", details: e?.stack, at: new Date().toISOString() });
      toast.error(e.message);
    } finally { setBusyFor(c.id, null); }
  };

  const doConnect = async (c: Connection) => {
    setBusyFor(c.id, "connect");
    try {
      const r = await connectFn({ data: { connectionId: c.id } });
      if (r.qr) setQr({ open: true, data: r.qr, name: c.name });
      else toast.info("Sem QR retornado — verifique o estado.");
      setDiag(c.id, { ok: true, action: "Conectar", message: r.qr ? "QR Code gerado" : "Sem QR retornado", details: JSON.stringify(r, null, 2), at: new Date().toISOString() });
      load();
    } catch (e: any) {
      setDiag(c.id, { ok: false, action: "Conectar", message: e?.message ?? "Falha ao conectar", details: e?.stack, at: new Date().toISOString() });
      toast.error(e.message);
    } finally { setBusyFor(c.id, null); }
  };

  const doDisconnect = async (c: Connection) => {
    setBusyFor(c.id, "disconnect");
    try {
      const r = await disconnectFn({ data: { connectionId: c.id } });
      setDiag(c.id, { ok: true, action: "Desconectar", message: "Desconectado", details: JSON.stringify(r, null, 2), at: new Date().toISOString() });
      toast.success("Desconectado");
      load();
    } catch (e: any) {
      setDiag(c.id, { ok: false, action: "Desconectar", message: e?.message ?? "Falha ao desconectar", details: e?.stack, at: new Date().toISOString() });
      toast.error(e.message);
    } finally { setBusyFor(c.id, null); }
  };

  const doTestWebhook = async (c: Connection) => {
    setBusyFor(c.id, "webhook");
    try {
      const r = await testWebhookFn({ data: { connectionId: c.id } });
      setDiag(c.id, { ok: r.ok, action: "Testar webhook", message: `HTTP ${r.status} · ${r.url}`, details: JSON.stringify(r, null, 2), at: new Date().toISOString() });
      r.ok ? toast.success(`Webhook OK (${r.status})`) : toast.error(`Webhook falhou (${r.status})`);
    } catch (e: any) {
      setDiag(c.id, { ok: false, action: "Testar webhook", message: e?.message ?? "Falha", details: e?.stack, at: new Date().toISOString() });
      toast.error(e.message);
    } finally { setBusyFor(c.id, null); }
  };

  const saveTimeout = async (c: Connection, hours: number) => {
    const meta = { ...(c.metadata ?? {}), flow_timeout_hours: hours };
    const { error } = await supabase.from("connections").update({ metadata: meta }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success(`Tempo de abandono: ${hours}h`);
    setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, metadata: meta } : x));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Conexões</h1>
          <p className="text-muted-foreground">Gerencie as instâncias de WhatsApp via Evolution API.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" /> Nova conexão</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nova conexão (Evolution API)</DialogTitle></DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-1"><Label>Nome</Label><Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Descrição</Label><Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
              <div className="space-y-1"><Label>URL da API</Label><Input required placeholder="https://evo.exemplo.com" value={form.url_api} onChange={(e) => setForm({ ...form, url_api: e.target.value })} /></div>
              <div className="space-y-1"><Label>API Key</Label><Input required value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} /></div>
              <div className="space-y-1"><Label>Nome da Instância</Label><Input required value={form.instance_name} onChange={(e) => setForm({ ...form, instance_name: e.target.value })} /></div>
              <div className="space-y-1"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
              <DialogFooter><Button type="submit">Salvar</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {loading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-muted-foreground">Nenhuma conexão cadastrada.</CardContent></Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <Card key={c.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-base">{c.name}</CardTitle>
                    <CardDescription>{c.instance_name}</CardDescription>
                  </div>
                  {statusBadge(c.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-xs text-muted-foreground space-y-1">
                  <div className="truncate"><span className="font-medium text-foreground">URL:</span> {c.url_api}</div>
                  {c.phone_number && <div><span className="font-medium text-foreground">Número:</span> {c.phone_number}</div>}
                  <div><span className="font-medium text-foreground">Mensagens:</span> {c.message_count}</div>
                  {c.last_sync && <div><span className="font-medium text-foreground">Sync:</span> {new Date(c.last_sync).toLocaleString()}</div>}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" disabled={!!busy[c.id]} onClick={() => doTest(c)}><Play className="h-3.5 w-3.5 mr-1" />Testar</Button>
                  <Button size="sm" disabled={!!busy[c.id]} onClick={() => doConnect(c)}><QrCode className="h-3.5 w-3.5 mr-1" />Conectar</Button>
                  <Button size="sm" variant="outline" disabled={!!busy[c.id]} onClick={() => doConnect(c)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Reconectar</Button>
                  <Button size="sm" variant="outline" disabled={!!busy[c.id]} onClick={() => doDisconnect(c)}><Power className="h-3.5 w-3.5 mr-1" />Desconectar</Button>
                  <Button size="sm" variant="outline" disabled={!!busy[c.id]} onClick={() => doTestWebhook(c)}><Webhook className="h-3.5 w-3.5 mr-1" />Testar webhook</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>

                <div className="rounded-md border p-2 space-y-1.5">
                  <Label className="text-xs">Abandono do fluxo (IA volta a responder depois de)</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {[12, 24, 48, 72].map((h) => {
                      const cur = Number(c.metadata?.flow_timeout_hours ?? 24);
                      return (
                        <Button key={h} size="sm" variant={cur === h ? "default" : "outline"} onClick={() => saveTimeout(c, h)}>
                          {h}h
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-md border bg-muted/30 p-2 text-xs">
                  <div className="flex items-center gap-1.5 font-medium">
                    <Activity className="h-3.5 w-3.5" />
                    Diagnóstico
                  </div>
                  {busy[c.id] ? (
                    <p className="mt-1 text-muted-foreground">Executando {busy[c.id]}…</p>
                  ) : diagnostics[c.id] ? (
                    <div className="mt-1 space-y-1">
                      <div className="flex items-center gap-1.5">
                        {diagnostics[c.id].ok ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-red-600" />
                        )}
                        <span className="font-medium">{diagnostics[c.id].action}:</span>
                        <span className={diagnostics[c.id].ok ? "text-green-700" : "text-red-700"}>
                          {diagnostics[c.id].message}
                        </span>
                      </div>
                      <div className="text-muted-foreground">
                        {new Date(diagnostics[c.id].at).toLocaleString()}
                      </div>
                      {diagnostics[c.id].details && (
                        <details>
                          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Detalhes</summary>
                          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap rounded bg-background p-2 text-[10px]">{diagnostics[c.id].details}</pre>
                        </details>
                      )}
                    </div>
                  ) : (
                    <p className="mt-1 text-muted-foreground">Nenhum teste executado ainda.</p>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={qr.open} onOpenChange={(o) => setQr({ ...qr, open: o })}>
        <DialogContent>
          <DialogHeader><DialogTitle>QR Code — {qr.name}</DialogTitle></DialogHeader>
          {qr.data && (
            <div className="flex justify-center p-4">
              <img src={qr.data.startsWith("data:") ? qr.data : `data:image/png;base64,${qr.data}`} alt="QR" className="w-64 h-64" />
            </div>
          )}
          <p className="text-sm text-muted-foreground text-center">Escaneie com o WhatsApp para conectar.</p>
        </DialogContent>
      </Dialog>
    </div>
  );
}