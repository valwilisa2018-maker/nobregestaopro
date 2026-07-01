import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import {
  MessageCircle, Plus, QrCode, RefreshCw, Power, Trash2, Loader2, Smartphone,
  CheckCircle2, ShieldCheck, Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  createAndConnectInstance, connectInstance, disconnectInstance, testConnection,
} from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Plataforma IA" }] }),
  component: Page,
});

type Connection = {
  id: string; name: string; instance_name: string; status: string;
  phone_number: string | null; profile_name: string | null; last_sync: string | null;
};

function statusBadge(s: string) {
  const map: Record<string, string> = {
    online: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
    connecting: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    offline: "bg-muted text-muted-foreground border-border",
  };
  const label = s === "online" ? "Conectado" : s === "connecting" ? "Aguardando" : "Desconectado";
  return <Badge variant="outline" className={map[s] ?? map.offline}>{label}</Badge>;
}

function Page() {
  const { user } = useAuth();
  const [items, setItems] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ name: "", instance_name: "" });
  const [creating, setCreating] = useState(false);
  const [qrModal, setQrModal] = useState<{ open: boolean; qr: string | null; name: string; connectionId: string | null }>({
    open: false, qr: null, name: "", connectionId: null,
  });
  const [busy, setBusy] = useState<Record<string, string | null>>({});

  const createFn = useServerFn(createAndConnectInstance);
  const connectFn = useServerFn(connectInstance);
  const disconnectFn = useServerFn(disconnectInstance);
  const testFn = useServerFn(testConnection);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("connections").select("id,name,instance_name,status,phone_number,profile_name,last_sync")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Connection[]);
    setLoading(false);
  };
  useEffect(() => { if (user) load(); }, [user]);

  // Poll QR modal status
  useEffect(() => {
    if (!qrModal.open || !qrModal.connectionId) return;
    const id = setInterval(async () => {
      try {
        const r = await testFn({ data: { connectionId: qrModal.connectionId! } });
        if (r.status === "online") {
          toast.success("WhatsApp conectado!");
          setQrModal({ open: false, qr: null, name: "", connectionId: null });
          load();
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(id);
  }, [qrModal.open, qrModal.connectionId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const r = await createFn({
        data: {
          name: form.name,
          instanceName: form.instance_name,
          webhookBaseUrl: typeof window !== "undefined" ? window.location.origin : undefined,
        },
      });
      toast.success("Instância criada — escaneie o QR");
      setOpenNew(false);
      setForm({ name: "", instance_name: "" });
      setQrModal({ open: true, qr: r.qr, name: form.name, connectionId: r.connectionId });
      load();
    } catch (e: any) {
      toast.error(e.message ?? "Falha ao criar instância");
    } finally { setCreating(false); }
  };

  const reconnect = async (c: Connection) => {
    setBusy((b) => ({ ...b, [c.id]: "connect" }));
    try {
      const r = await connectFn({ data: { connectionId: c.id } });
      setQrModal({ open: true, qr: r.qr, name: c.name, connectionId: c.id });
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setBusy((b) => ({ ...b, [c.id]: null })); }
  };

  const disconnect = async (c: Connection) => {
    setBusy((b) => ({ ...b, [c.id]: "disconnect" }));
    try { await disconnectFn({ data: { connectionId: c.id } }); toast.success("Desconectado"); load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy((b) => ({ ...b, [c.id]: null })); }
  };

  const remove = async (c: Connection) => {
    if (!confirm(`Excluir instância "${c.name}"?`)) return;
    const { error } = await supabase.from("connections").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Removida"); load();
  };

  return (
    <PageShell
      title="WhatsApp"
      description="Crie uma nova instância, escaneie o QR Code e comece a atender."
      icon={<MessageCircle className="h-6 w-6" />}
      status="ativo"
      actions={
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Nova instância</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nova instância de WhatsApp</DialogTitle>
              <DialogDescription>
                Damos um nome e um identificador único. O QR Code é gerado em seguida.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={create} className="space-y-3">
              <div className="space-y-1.5">
                <Label>Nome</Label>
                <Input required placeholder="Ex.: Atendimento Vendas" value={form.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    const slug = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
                      .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
                    setForm({ name, instance_name: slug });
                  }} />
              </div>
              <div className="space-y-1.5">
                <Label>Identificador (instance name)</Label>
                <Input required pattern="[a-zA-Z0-9_-]+" value={form.instance_name}
                  onChange={(e) => setForm({ ...form, instance_name: e.target.value })} />
                <p className="text-xs text-muted-foreground">Somente letras, números, "_" e "-".</p>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={creating}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                  Gerar QR Code
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : items.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-3">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Smartphone className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Nenhuma instância ainda</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Configure a Evolution API em <Link to="/settings" className="text-primary underline">Configurações</Link> e crie sua primeira instância.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <Card key={c.id} className="group hover:border-primary/40 transition-colors">
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
                      <MessageCircle className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-base">{c.name}</CardTitle>
                      <CardDescription className="font-mono text-xs">{c.instance_name}</CardDescription>
                    </div>
                  </div>
                  {statusBadge(c.status)}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {c.phone_number && <div className="text-xs text-muted-foreground">📱 {c.phone_number}</div>}
                {c.last_sync && <div className="text-xs text-muted-foreground">Última sync: {new Date(c.last_sync).toLocaleString()}</div>}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => reconnect(c)} disabled={!!busy[c.id]}>
                    <QrCode className="h-3.5 w-3.5" /> QR
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => reconnect(c)} disabled={!!busy[c.id]}>
                    <RefreshCw className="h-3.5 w-3.5" /> Reconectar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => disconnect(c)} disabled={!!busy[c.id]}>
                    <Power className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(c)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Premium QR modal */}
      <Dialog open={qrModal.open} onOpenChange={(o) => setQrModal({ ...qrModal, open: o })}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <div className="relative bg-gradient-to-br from-primary/20 via-card to-accent/30 p-6">
            <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/20 text-primary ring-1 ring-primary/40">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle className="text-xl">Conectar WhatsApp</DialogTitle>
                <DialogDescription>Instância <b>{qrModal.name}</b> — escaneie o QR abaixo</DialogDescription>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6 p-6">
            <div className="flex flex-col items-center justify-center gap-3">
              <div className="rounded-2xl bg-white p-4 ring-1 ring-border shadow-lg">
                {qrModal.qr ? (
                  <img
                    src={qrModal.qr.startsWith("data:") ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                    alt="QR Code" className="h-56 w-56"
                  />
                ) : (
                  <div className="h-56 w-56 grid place-items-center text-muted-foreground">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Wifi className="h-3.5 w-3.5 animate-pulse text-primary" />
                Aguardando conexão…
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Smartphone className="h-4 w-4 text-primary" /> Como conectar
              </h3>
              <ol className="space-y-3 text-sm">
                {[
                  "Abra o WhatsApp no seu celular",
                  "Toque em Menu (⋮) ou Configurações",
                  'Selecione "Aparelhos conectados"',
                  'Toque em "Conectar um aparelho"',
                  "Aponte a câmera para o QR Code ao lado",
                ].map((step, i) => (
                  <li key={i} className="flex gap-3">
                    <div className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/15 text-primary text-xs font-semibold ring-1 ring-primary/30">
                      {i + 1}
                    </div>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-xs space-y-1.5">
                <div className="flex items-center gap-1.5 font-medium text-primary">
                  <ShieldCheck className="h-3.5 w-3.5" /> Webhook individual ativo
                </div>
                <p className="text-muted-foreground">Um endpoint dedicado foi criado para esta instância receber mensagens em tempo real.</p>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 text-xs flex items-start gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                <p className="text-muted-foreground">Ao escanear, esta janela fecha automaticamente e a instância aparece como <b>Conectado</b>.</p>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t bg-muted/20">
            <Button variant="outline" onClick={() => qrModal.connectionId && reconnect({ id: qrModal.connectionId, name: qrModal.name } as Connection)}>
              <RefreshCw className="h-4 w-4" /> Gerar novo QR
            </Button>
            <Button onClick={() => setQrModal({ open: false, qr: null, name: "", connectionId: null })}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
