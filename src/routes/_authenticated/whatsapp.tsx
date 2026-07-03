import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  Wifi, AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  createAndConnectInstance, connectInstance, disconnectInstance, testConnection, deleteInstance,
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
    online: "bg-[#25D366]/15 text-[#25D366] border-[#25D366]/40",
    connecting: "bg-amber-500/15 text-amber-500 border-amber-500/30",
    offline: "bg-muted text-muted-foreground border-border",
  };
  const label = s === "online" ? "Conectado" : s === "connecting" ? "Aguardando" : "Desconectado";
  return (
    <Badge variant="outline" className={`gap-1.5 ${map[s] ?? map.offline}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s === "online" ? "bg-[#25D366] animate-pulse" : s === "connecting" ? "bg-amber-500 animate-pulse" : "bg-muted-foreground"}`} />
      {label}
    </Badge>
  );
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
  // Per-connection reconnect state: attempts + next allowed retry timestamp
  const retryRef = useRef<Record<string, { attempts: number; nextAt: number; inFlight: boolean }>>({});
  const [retryTick, setRetryTick] = useState(0); // force re-render for feedback
  const MAX_ATTEMPTS = 6;
  const BASE_DELAY = 5000; // 5s, doubles up to ~5min

  const createFn = useServerFn(createAndConnectInstance);
  const connectFn = useServerFn(connectInstance);
  const disconnectFn = useServerFn(disconnectInstance);
  const testFn = useServerFn(testConnection);
  const deleteFn = useServerFn(deleteInstance);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("connections").select("id,name,instance_name,status,phone_number,profile_name,last_sync")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as Connection[]);
    setLoading(false);
  };
  useEffect(() => { if (user) load(); }, [user]);

  // Tick every second to refresh retry countdown UI
  useEffect(() => {
    const id = setInterval(() => setRetryTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Continuous status sync + auto-reconnect with exponential backoff
  useEffect(() => {
    if (!user || items.length === 0) return;
    let cancelled = false;
    const tick = async () => {
      for (const c of items) {
        try {
          const r = await testFn({ data: { connectionId: c.id } });
          if (cancelled) return;
          const prevStatus = c.status;
          if (r.status !== prevStatus) {
            setItems((prev) => prev.map((x) => x.id === c.id ? { ...x, status: r.status } : x));
          }
          const st = retryRef.current[c.id] ?? { attempts: 0, nextAt: 0, inFlight: false };
          if (r.status === "online") {
            if (st.attempts > 0 || prevStatus !== "online") {
              retryRef.current[c.id] = { attempts: 0, nextAt: 0, inFlight: false };
              setRetryTick((t) => t + 1);
              if (prevStatus !== "online") toast.success(`${c.name}: WhatsApp conectado`);
            }
          } else if (r.status === "offline") {
            if (prevStatus === "online") toast.error(`${c.name}: WhatsApp desconectado`);
            const now = Date.now();
            if (!st.inFlight && st.attempts < MAX_ATTEMPTS && now >= st.nextAt) {
              st.inFlight = true;
              retryRef.current[c.id] = st;
              setRetryTick((t) => t + 1);
              try {
                await connectFn({ data: { connectionId: c.id } });
                st.attempts += 1;
                st.nextAt = Date.now() + BASE_DELAY * Math.pow(2, st.attempts - 1);
                toast.message(`${c.name}: reconectando… (${st.attempts}/${MAX_ATTEMPTS})`);
              } catch { /* ignore */ }
              finally {
                st.inFlight = false;
                retryRef.current[c.id] = st;
                setRetryTick((t) => t + 1);
                if (st.attempts >= MAX_ATTEMPTS) {
                  toast.error(`${c.name}: falha após ${MAX_ATTEMPTS} tentativas. Reconecte manualmente.`);
                }
              }
            }
          }
        } catch { /* ignore */ }
      }
    };
    tick();
    const id = setInterval(tick, 10000);
    return () => { cancelled = true; clearInterval(id); };
  }, [user, items]);

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

  // Auto-fetch QR when modal opens without one
  useEffect(() => {
    if (!qrModal.open || !qrModal.connectionId || qrModal.qr) return;
    let cancelled = false;
    const fetchQr = async () => {
      try {
        const r = await connectFn({ data: { connectionId: qrModal.connectionId! } });
        if (!cancelled && r.qr) setQrModal((m) => ({ ...m, qr: r.qr }));
      } catch { /* ignore */ }
    };
    fetchQr();
    const id = setInterval(fetchQr, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, [qrModal.open, qrModal.connectionId, qrModal.qr]);

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
    setBusy((b) => ({ ...b, [c.id]: "delete" }));
    try {
      await deleteFn({ data: { connectionId: c.id } });
      toast.success("Removida");
      load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao remover");
    } finally {
      setBusy((b) => ({ ...b, [c.id]: null }));
    }
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
            <Button className="bg-[#25D366] hover:bg-[#1ebe5b] text-white"><Plus className="h-4 w-4" /> Nova instância</Button>
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
      {items.some((c) => c.status === "offline") && (
        <Card className="border-destructive/40 bg-destructive/5 mb-4">
          <CardContent className="py-3 flex items-center gap-3 text-sm">
            <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
            <span className="text-destructive-foreground/90">
              Algumas instâncias estão desconectadas. Tentativa automática de reconexão em andamento.
            </span>
          </CardContent>
        </Card>
      )}
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
            <Card key={c.id} className={`group transition-colors ${c.status === "online" ? "border-[#25D366]/40 bg-[#25D366]/[0.03]" : "hover:border-primary/40"}`}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <div className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ${c.status === "online" ? "bg-[#25D366]/15 text-[#25D366] ring-[#25D366]/40" : "bg-primary/15 text-primary ring-primary/30"}`}>
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
                {c.status === "offline" && (() => {
                  const st = retryRef.current[c.id];
                  if (!st || st.attempts === 0) return null;
                  const maxed = st.attempts >= MAX_ATTEMPTS;
                  const secs = Math.max(0, Math.ceil((st.nextAt - Date.now()) / 1000));
                  return (
                    <div className={`flex items-center gap-2 text-xs ${maxed ? "text-destructive" : "text-amber-500"}`}>
                      {st.inFlight ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {maxed
                        ? `Falhou após ${MAX_ATTEMPTS} tentativas`
                        : st.inFlight
                          ? `Reconectando… (${st.attempts}/${MAX_ATTEMPTS})`
                          : `Próxima tentativa em ${secs}s (${st.attempts}/${MAX_ATTEMPTS})`}
                      {maxed && (
                        <button
                          className="underline"
                          onClick={() => { retryRef.current[c.id] = { attempts: 0, nextAt: 0, inFlight: false }; setRetryTick((t) => t + 1); }}
                        >
                          Resetar
                        </button>
                      )}
                    </div>
                  );
                })()}
                <div className="flex flex-wrap gap-2">
                  {c.status !== "online" && (
                    <Button size="sm" className="bg-[#25D366] hover:bg-[#1ebe5b] text-white" onClick={() => reconnect(c)} disabled={!!busy[c.id]}>
                      <QrCode className="h-3.5 w-3.5" /> QR
                    </Button>
                  )}
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
        <DialogContent className="max-w-sm overflow-hidden p-0 border-border/60">
          <div className="p-5 space-y-5">
            <DialogHeader className="space-y-0">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <DialogTitle className="text-base">Conectar ao WhatsApp</DialogTitle>
                  <DialogDescription className="text-xs">Sincronizar com seu dispositivo</DialogDescription>
                </div>
              </div>
            </DialogHeader>

            <div className="text-center space-y-1">
              <h3 className="font-semibold text-lg">Quase lá! 🚀</h3>
              <p className="text-xs text-muted-foreground">Escaneie o QR Code para conectar ao WhatsApp</p>
            </div>

            <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-6 flex flex-col items-center gap-4">
              {qrModal.qr ? (
                <div className="rounded-xl bg-white p-3 ring-1 ring-border">
                  <img
                    src={qrModal.qr.startsWith("data:") ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                    alt="QR Code" className="h-44 w-44"
                  />
                </div>
              ) : (
                <>
                  <QrCode className="h-20 w-20 text-primary/70" strokeWidth={1.2} />
                </>
              )}
              <Button
                variant={qrModal.qr ? "outline" : "default"}
                onClick={async () => {
                  if (!qrModal.connectionId) return;
                  setQrModal((m) => ({ ...m, qr: null }));
                  try {
                    const r = await connectFn({ data: { connectionId: qrModal.connectionId } });
                    setQrModal((m) => ({ ...m, qr: r.qr }));
                    if (!r.qr) toast.error("QR ainda não disponível — tente novamente");
                  } catch (e: any) { toast.error(e.message ?? "Falha ao gerar QR"); }
                }}
                className="rounded-full px-6"
              >
                <RefreshCw className="h-4 w-4" /> {qrModal.qr ? "Atualizar QR" : "Gerar QR Code"}
              </Button>
              {qrModal.qr && (
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Wifi className="h-3.5 w-3.5 animate-pulse text-primary" />
                  Aguardando conexão…
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <Plus className="h-4 w-4" /> Como conectar
              </div>
              <ol className="space-y-2.5 text-xs">
                {[
                  "Abra o WhatsApp no seu celular",
                  "Vá em Configurações → Dispositivos conectados",
                  "Toque em Conectar um dispositivo e escaneie o código",
                ].map((step, i) => (
                  <li key={i} className="flex gap-2.5 items-start">
                    <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-primary/15 text-primary text-[10px] font-bold ring-1 ring-primary/30">
                      {i + 1}
                    </div>
                    <span className="text-muted-foreground pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
