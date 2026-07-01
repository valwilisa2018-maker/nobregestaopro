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
import { Plus, RefreshCw, Play, Power, Trash2, QrCode } from "lucide-react";
import { toast } from "sonner";
import { testConnection, connectInstance, disconnectInstance } from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/connections")({
  head: () => ({ meta: [{ title: "Conexões — Plataforma IA WhatsApp" }] }),
  component: ConnectionsPage,
});

type Connection = {
  id: string; name: string; description: string | null; provider: string;
  url_api: string; api_key: string; instance_name: string; status: string;
  phone_number: string | null; profile_name: string | null; profile_picture: string | null;
  notes: string | null; message_count: number; consumption: number; last_sync: string | null;
  created_at: string;
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

  const testFn = useServerFn(testConnection);
  const connectFn = useServerFn(connectInstance);
  const disconnectFn = useServerFn(disconnectInstance);

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
    try {
      const r = await testFn({ data: { connectionId: c.id } });
      toast.success(`Estado: ${r.state}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doConnect = async (c: Connection) => {
    try {
      const r = await connectFn({ data: { connectionId: c.id } });
      if (r.qr) setQr({ open: true, data: r.qr, name: c.name });
      else toast.info("Sem QR retornado — verifique o estado.");
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const doDisconnect = async (c: Connection) => {
    try {
      await disconnectFn({ data: { connectionId: c.id } });
      toast.success("Desconectado");
      load();
    } catch (e: any) { toast.error(e.message); }
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
                  <Button size="sm" variant="secondary" onClick={() => doTest(c)}><Play className="h-3.5 w-3.5 mr-1" />Testar</Button>
                  <Button size="sm" onClick={() => doConnect(c)}><QrCode className="h-3.5 w-3.5 mr-1" />Conectar</Button>
                  <Button size="sm" variant="outline" onClick={() => doConnect(c)}><RefreshCw className="h-3.5 w-3.5 mr-1" />Reconectar</Button>
                  <Button size="sm" variant="outline" onClick={() => doDisconnect(c)}><Power className="h-3.5 w-3.5 mr-1" />Desconectar</Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
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