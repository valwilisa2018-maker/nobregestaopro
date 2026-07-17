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
  Wifi, AlertTriangle, Send,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import {
  createAndConnectInstance, connectInstance, disconnectInstance, testConnection, deleteInstance, sendTestMessage,
} from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "Conexão WhatsApp — Plataforma IA" }] }),
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
  const sendTestFn = useServerFn(sendTestMessage);
  const deleteFn = useServerFn(deleteInstance);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("connections").select("id,name,instance_name,status,phone_number,profile_name,last_sync")
      .eq("user_id", user.id)
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
          // Keep modal open on success so the user sees the premium confirmation
          // (phone number, actions). It can be closed manually.
          load();
        }
      } catch { /* ignore */ }
    }, 4000);
    return () => clearInterval(id);
  }, [qrModal.open, qrModal.connectionId]);

  // Auto-fetch QR when modal opens without one
  useEffect(() => {
    if (!qrModal.open || !qrModal.connectionId || qrModal.qr) return;
    // Do not fetch a QR when the connection is already online — modal shows success state
    const current = items.find((x) => x.id === qrModal.connectionId);
    if (current?.status === "online") return;
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
  }, [qrModal.open, qrModal.connectionId, qrModal.qr, items]);

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

  const sendTest = async (c: Connection) => {
    const suggested = c.phone_number ?? "";
    const number = window.prompt(
      `Enviar "oi" para qual número? (formato internacional, ex.: 5511999998888)`,
      suggested,
    );
    if (!number) return;
    setBusy((b) => ({ ...b, [c.id]: "test-msg" }));
    try {
      await sendTestFn({ data: { connectionId: c.id, number, text: "oi" } });
      toast.success(`Mensagem enviada para ${number}. Aguarde a resposta do agente…`);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar teste");
    } finally {
      setBusy((b) => ({ ...b, [c.id]: null }));
    }
  };

  const onlineCount = items.filter((i) => i.status === "online").length;
  const offlineCount = items.filter((i) => i.status === "offline").length;
  const connectingCount = items.filter((i) => i.status === "connecting").length;

  const newInstanceDialog = (
    <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
        <Button className="bg-gradient-to-br from-[#25D366] to-[#1ebe5b] text-white shadow-[0_10px_30px_-10px_rgba(37,211,102,0.6)] hover:opacity-90">
          <Plus className="mr-2 h-4 w-4" /> Nova instância
        </Button>
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
  );

  return (
    <PageShell>
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-500/25 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-teal-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-[#25D366] to-[#1ebe5b] shadow-[0_10px_30px_-10px_rgba(37,211,102,0.7)] ring-1 ring-white/20">
              <MessageCircle className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-emerald-300 via-green-200 to-teal-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Conexão WhatsApp
                </h1>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">Ativo</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Conecte, gerencie e reconecte seus números do WhatsApp.</p>
            </div>
          </div>
          {newInstanceDialog}
        </div>

        {/* KPIs */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Instâncias", value: items.length, tone: "from-blue-500/25 to-cyan-500/10", ring: "ring-blue-500/30" },
            { label: "Conectadas", value: onlineCount, tone: "from-emerald-500/25 to-teal-500/10", ring: "ring-emerald-500/30" },
            { label: "Conectando", value: connectingCount, tone: "from-amber-500/25 to-orange-500/10", ring: "ring-amber-500/30" },
            { label: "Offline", value: offlineCount, tone: "from-rose-500/25 to-red-500/10", ring: "ring-rose-500/30" },
          ].map((k) => (
            <div key={k.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${k.tone} p-4 ring-1 ${k.ring} backdrop-blur`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

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
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-card/60 to-card/30 p-16 text-center backdrop-blur-xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(37,211,102,0.10),transparent_60%)]" />
          <div className="relative mx-auto grid h-24 w-24 place-items-center">
            <div className="absolute inset-0 rounded-full bg-emerald-500/30 blur-2xl" />
            <div className="absolute inset-0 animate-ping rounded-full bg-emerald-500/20" />
            <div className="relative grid h-24 w-24 place-items-center rounded-3xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 text-emerald-300 ring-1 ring-white/10">
              <Smartphone className="h-10 w-10" />
            </div>
          </div>
          <h3 className="relative mt-6 text-xl font-semibold">Conecte seu WhatsApp em segundos</h3>
          <p className="relative mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Clique em <span className="font-medium text-foreground">Nova instância</span>, escaneie o QR Code e pronto — seu WhatsApp estará conectado em menos de 1 minuto.
          </p>
          <div className="relative mt-6 inline-flex">{newInstanceDialog}</div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => {
            const online = c.status === "online";
            const phoneFmt = c.phone_number ? (c.phone_number.startsWith("+") ? c.phone_number : `+${c.phone_number}`) : null;
            return (
              <div
                key={c.id}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-6 shadow-2xl transition-all hover:-translate-y-0.5 hover:border-[#25D366]/40 hover:shadow-[0_20px_60px_-20px_rgba(37,211,102,0.35)]"
              >
                {/* Ambient glow */}
                <div className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl transition-opacity ${online ? "bg-[#25D366]/20 opacity-100" : "bg-primary/10 opacity-60"}`} />

                {/* Header */}
                <div className="relative mb-5 flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl border ${online ? "bg-[#25D366]/10 border-[#25D366]/25 text-[#25D366]" : "bg-primary/10 border-primary/20 text-primary"}`}>
                      <MessageCircle className="h-6 w-6" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="truncate text-base font-semibold leading-tight text-foreground">{c.name}</h3>
                      {phoneFmt ? (
                        <p className="truncate font-mono text-sm text-muted-foreground">{phoneFmt}</p>
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">{c.instance_name}</p>
                      )}
                    </div>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${online ? "border-[#25D366]/30 bg-[#25D366]/10 text-[#25D366]" : "border-border bg-muted/40 text-muted-foreground"}`}>
                    <span className={`relative flex h-1.5 w-1.5`}>
                      {online && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#25D366] opacity-75" />}
                      <span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${online ? "bg-[#25D366]" : "bg-muted-foreground"}`} />
                    </span>
                    {online ? "Conectado" : c.status === "connecting" ? "Conectando" : "Offline"}
                  </span>
                </div>

                {/* Divider with sync info */}
                <div className="relative mb-5 flex items-center gap-2">
                  <div className="h-px flex-1 bg-border/70" />
                  <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                    {c.last_sync ? `Última sync: ${new Date(c.last_sync).toLocaleString("pt-BR")}` : `Instância: ${c.instance_name}`}
                  </p>
                  <div className="h-px flex-1 bg-border/70" />
                </div>

                {/* Retry state */}
                {c.status === "offline" && (() => {
                  const st = retryRef.current[c.id];
                  if (!st || st.attempts === 0) return null;
                  const maxed = st.attempts >= MAX_ATTEMPTS;
                  const secs = Math.max(0, Math.ceil((st.nextAt - Date.now()) / 1000));
                  return (
                    <div className={`mb-4 flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${maxed ? "border-destructive/30 bg-destructive/10 text-destructive" : "border-amber-500/30 bg-amber-500/10 text-amber-500"}`}>
                      {st.inFlight ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      {maxed ? `Falhou após ${MAX_ATTEMPTS} tentativas` : st.inFlight ? `Reconectando… (${st.attempts}/${MAX_ATTEMPTS})` : `Próxima tentativa em ${secs}s (${st.attempts}/${MAX_ATTEMPTS})`}
                      {maxed && (
                        <button className="ml-auto underline" onClick={() => { retryRef.current[c.id] = { attempts: 0, nextAt: 0, inFlight: false }; setRetryTick((t) => t + 1); }}>Resetar</button>
                      )}
                    </div>
                  );
                })()}

                {/* Actions grid */}
                <div className="relative grid grid-cols-2 gap-2.5">
                  {!online && (
                    <button
                      onClick={() => reconnect(c)}
                      disabled={!!busy[c.id]}
                      className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-2.5 text-sm font-semibold text-foreground transition-all hover:bg-[#1ebe5b] disabled:opacity-60"
                    >
                      <QrCode className="h-4 w-4" /> Conectar via QR
                    </button>
                  )}
                  <button
                    onClick={() => reconnect(c)}
                    disabled={!!busy[c.id]}
                    className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-60"
                  >
                    <RefreshCw className="h-4 w-4" /> Reconectar
                  </button>
                  {online ? (
                    <button
                      onClick={() => sendTest(c)}
                      disabled={!!busy[c.id]}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-60"
                    >
                      {busy[c.id] === "test-msg" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 text-[#25D366]" />}
                      Enviar teste
                    </button>
                  ) : (
                    <button
                      onClick={() => disconnect(c)}
                      disabled={!!busy[c.id]}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-60"
                    >
                      <Power className="h-4 w-4" /> Desligar
                    </button>
                  )}
                  {online && (
                    <button
                      onClick={() => disconnect(c)}
                      disabled={!!busy[c.id]}
                      className="flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/40 px-4 py-2.5 text-sm font-medium text-foreground transition-all hover:bg-muted disabled:opacity-60"
                    >
                      <Power className="h-4 w-4" /> Desligar
                    </button>
                  )}
                  <button
                    onClick={() => remove(c)}
                    className="flex items-center justify-center gap-2 rounded-xl border border-destructive/25 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive transition-all hover:bg-destructive/20"
                  >
                    <Trash2 className="h-4 w-4" /> Excluir
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Premium connection modal */}
      <Dialog open={qrModal.open} onOpenChange={(o) => setQrModal({ ...qrModal, open: o })}>
        <DialogContent className="max-w-md overflow-hidden p-0 border-border/60">
          {(() => {
            const current = items.find((x) => x.id === qrModal.connectionId);
            const online = current?.status === "online";
            return (
              <>
                {/* Header with gradient */}
                <div
                  className="relative px-6 pt-6 pb-8"
                  style={{
                    background: online
                      ? "linear-gradient(135deg, #25D366 0%, #128C7E 100%)"
                      : "linear-gradient(135deg, var(--primary) 0%, color-mix(in oklch, var(--primary) 75%, transparent) 100%)",
                  }}
                >
                  <div className="absolute inset-0 opacity-20 pointer-events-none"
                    style={{ backgroundImage: "radial-gradient(circle at 30% 20%, rgba(255,255,255,0.35), transparent 50%)" }} />
                  <DialogHeader className="relative space-y-0">
                    <div className="flex items-center gap-3">
                      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-white/20 backdrop-blur ring-1 ring-white/30 text-foreground">
                        <MessageCircle className="h-5 w-5" />
                      </div>
                      <div className="text-left text-foreground">
                        <DialogTitle className="text-base font-semibold">
                          {online ? "WhatsApp conectado" : "Conectar WhatsApp"}
                        </DialogTitle>
                        <DialogDescription className="text-xs text-foreground/80">
                          {qrModal.name || (online ? "Instância pronta para atender" : "Sincronizar com seu dispositivo")}
                        </DialogDescription>
                      </div>
                    </div>
                  </DialogHeader>
                  {online && current?.phone_number && (
                    <div className="relative mt-5 flex items-end gap-3 text-foreground">
                      <div>
                        <div className="text-[10px] uppercase tracking-widest opacity-80">Número conectado</div>
                        <div className="mt-0.5 font-mono text-xl font-semibold">+{current.phone_number}</div>
                        {current.profile_name && (
                          <div className="text-xs opacity-90">{current.profile_name}</div>
                        )}
                      </div>
                      <div className="ml-auto flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] backdrop-blur">
                        <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Online
                      </div>
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-5">
                  {online ? (
                    <>
                      <div className="rounded-2xl border border-[#25D366]/30 bg-[#25D366]/[0.05] p-4 flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#25D366] text-foreground">
                          <Wifi className="h-5 w-5" />
                        </div>
                        <div className="text-sm">
                          <div className="font-medium">Tudo pronto! 🎉</div>
                          <div className="text-xs text-muted-foreground">Seu número já pode enviar e receber mensagens.</div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          variant="outline"
                          onClick={async () => {
                            if (!current) return;
                            await reconnect(current);
                          }}
                          disabled={!!busy[current?.id ?? ""]}
                        >
                          <RefreshCw className="h-4 w-4" /> Reconectar
                        </Button>
                        <Button
                          variant="outline"
                          className="text-destructive hover:text-destructive"
                          onClick={async () => {
                            if (!current) return;
                            await disconnect(current);
                            setQrModal({ open: false, qr: null, name: "", connectionId: null });
                          }}
                          disabled={!!busy[current?.id ?? ""]}
                        >
                          <Power className="h-4 w-4" /> Desconectar
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rounded-2xl border-2 border-dashed border-primary/30 bg-primary/[0.03] p-6 flex flex-col items-center gap-4">
                        {qrModal.qr ? (
                          <div className="rounded-xl bg-white p-3 ring-1 ring-border shadow-lg">
                            <img
                              src={qrModal.qr.startsWith("data:") ? qrModal.qr : `data:image/png;base64,${qrModal.qr}`}
                              alt="QR Code" className="h-48 w-48"
                            />
                          </div>
                        ) : (
                          <QrCode className="h-20 w-20 text-primary/70" strokeWidth={1.2} />
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
                    </>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
