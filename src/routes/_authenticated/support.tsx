import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Progress } from "@/components/ui/progress";
import {
  LifeBuoy, Loader2, Send, Plus, Phone, Mail, MessageCircle, Search, Paperclip,
  X, FileText, ImageIcon, Sparkles, Star, Upload, CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/support")({
  head: () => ({ meta: [{ title: "Suporte — Central de Atendimento Premium" }] }),
  component: Page,
});

// ---------- constants ----------
const CATEGORIES = [
  "Problema Técnico", "Erro na Plataforma", "WhatsApp", "Integrações", "API",
  "Cobrança", "Financeiro", "Sugestão", "Solicitação de Nova Funcionalidade",
  "Cancelamento", "Conta", "Login", "Performance", "Outro",
] as const;

const PRIORITIES = [
  { value: "low", label: "Baixa", icon: "🟢", cls: "text-emerald-500 border-emerald-500/40 bg-emerald-500/10" },
  { value: "normal", label: "Normal", icon: "🟡", cls: "text-yellow-500 border-yellow-500/40 bg-yellow-500/10" },
  { value: "high", label: "Alta", icon: "🟠", cls: "text-orange-500 border-orange-500/40 bg-orange-500/10" },
  { value: "urgent", label: "Urgente", icon: "🔴", cls: "text-red-500 border-red-500/40 bg-red-500/10" },
] as const;

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "bg-blue-500/15 text-blue-500 border-blue-500/40" },
  in_analysis: { label: "Em análise", cls: "bg-violet-500/15 text-violet-500 border-violet-500/40" },
  in_progress: { label: "Em andamento", cls: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  pending: { label: "Aguardando cliente", cls: "bg-cyan-500/15 text-cyan-500 border-cyan-500/40" },
  waiting_dev: { label: "Aguardando desenvolvimento", cls: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/40" },
  resolved: { label: "Resolvido", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  closed: { label: "Fechado", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelado", cls: "bg-red-500/15 text-red-500 border-red-500/40" },
};

const ENVIRONMENTS = ["Desktop", "Notebook", "Android", "iPhone", "Tablet"];
const BROWSERS = ["Chrome", "Edge", "Firefox", "Safari", "Opera", "Outro"];

// ---------- types ----------
type Attachment = { path: string; name: string; size: number; type: string };
type Ticket = {
  id: string; ticket_number: number | null; subject: string; status: string;
  priority: string | null; category: string | null; environment: string | null;
  browser: string | null; page_url: string | null; attachments: Attachment[] | null;
  rating: number | null; rating_comment: string | null;
  resolved_at: string | null; closed_at: string | null; first_response_at: string | null;
  last_message_at: string; created_at: string; user_id: string;
};
type Msg = {
  id: string; ticket_id: string; sender_role: string; body: string;
  attachments: Attachment[] | null; created_at: string;
};
type SupportContacts = { phone?: string; email?: string; whatsapp?: string; whatsapp_message?: string };

// ---------- utils ----------
function detectBrowser(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrome\//.test(ua)) return "Chrome";
  if (/Safari\//.test(ua)) return "Safari";
  return "Outro";
}
function detectEnv(): string {
  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "Tablet";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android" : "Tablet";
  return "Desktop";
}
function fmtSize(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDur(from?: string | null, to?: string | null) {
  if (!from) return "—";
  const a = new Date(from).getTime();
  const b = to ? new Date(to).getTime() : Date.now();
  const s = Math.max(0, Math.floor((b - a) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// ---------- component ----------
function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [greeting, setGreeting] = useState("");
  const [userId, setUserId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("support_tickets")
      .select("*")
      .order("last_message_at", { ascending: false });
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      setUserId(u.id);
      const name = (u.user_metadata?.full_name as string | undefined) || u.email?.split("@")[0] || "Cliente";
      const hour = new Date().getHours();
      const g = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";
      setGreeting(`${g}, ${name}`);
    });
    supabase.from("internal_config").select("value").eq("key", "support_contacts").maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        try { setContacts(JSON.parse(data.value) as SupportContacts); } catch { /* ignore */ }
      });
  }, []);

  // realtime tickets
  useEffect(() => {
    if (!userId) return;
    const ch = supabase.channel(`sup-tk-${userId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${userId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [userId, load]);

  const filtered = useMemo(() => tickets.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q) && !String(t.ticket_number ?? "").includes(q)) return false;
    }
    return true;
  }), [tickets, search]);

  const selected = tickets.find(t => t.id === selectedId) ?? null;

  return (
    <PageShell
      title="Central de Suporte"
      description="Acompanhe seus chamados, converse com nossa equipe em tempo real e tenha soluções sob medida."
      icon={<LifeBuoy className="h-6 w-6" />}
      status="ativo"
      actions={
        <Button size="lg" onClick={() => setNewOpen(true)}
          className="bg-gradient-to-r from-primary via-primary to-primary/80 shadow-lg shadow-primary/30 hover:shadow-primary/50 gap-2">
          <Plus className="h-4 w-4" /> Abrir Novo Chamado
        </Button>
      }
    >
      {/* Welcome banner */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background p-5 backdrop-blur-xl">
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-primary/80">
              <Sparkles className="h-3.5 w-3.5" /> Central Premium
            </div>
            <h2 className="text-2xl font-bold tracking-tight mt-1">{greeting || "Bem-vindo"}</h2>
            <p className="text-sm text-muted-foreground">Como podemos ajudar você hoje?</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 gap-1.5">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              Sistema Online
            </Badge>
          </div>
        </div>
      </motion.div>

      {/* Contatos rápidos */}
      {(contacts.phone || contacts.email || contacts.whatsapp) && (
        <div className="grid gap-3 sm:grid-cols-3">
          {contacts.whatsapp && (
            <a href={`https://wa.me/${contacts.whatsapp.replace(/\D/g, "")}${contacts.whatsapp_message ? `?text=${encodeURIComponent(contacts.whatsapp_message)}` : ""}`}
              target="_blank" rel="noopener noreferrer"
              className="group flex items-center gap-3 rounded-xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-transparent p-4 transition hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-500/10">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-emerald-500/20 text-emerald-500"><MessageCircle className="h-5 w-5" /></div>
              <div className="min-w-0"><div className="text-xs uppercase tracking-wide text-muted-foreground">WhatsApp</div><div className="truncate font-semibold text-sm">{contacts.whatsapp}</div></div>
            </a>
          )}
          {contacts.phone && (
            <a href={`tel:${contacts.phone.replace(/\s/g, "")}`}
              className="group flex items-center gap-3 rounded-xl border border-primary/30 bg-gradient-to-br from-primary/10 to-transparent p-4 transition hover:border-primary/60 hover:shadow-lg hover:shadow-primary/10">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-primary/20 text-primary"><Phone className="h-5 w-5" /></div>
              <div className="min-w-0"><div className="text-xs uppercase tracking-wide text-muted-foreground">Telefone</div><div className="truncate font-semibold text-sm">{contacts.phone}</div></div>
            </a>
          )}
          {contacts.email && (
            <a href={`mailto:${contacts.email}`}
              className="group flex items-center gap-3 rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-500/10 to-transparent p-4 transition hover:border-blue-500/60 hover:shadow-lg hover:shadow-blue-500/10">
              <div className="grid h-11 w-11 place-items-center rounded-lg bg-blue-500/20 text-blue-500"><Mail className="h-5 w-5" /></div>
              <div className="min-w-0"><div className="text-xs uppercase tracking-wide text-muted-foreground">E-mail</div><div className="truncate font-semibold text-sm">{contacts.email}</div></div>
            </a>
          )}
        </div>
      )}

      {/* Lista */}
      <Card className="border-border/60 backdrop-blur-xl bg-card/60">
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Buscar por título ou #número" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <Button variant="outline" size="icon" onClick={load} title="Atualizar"><RefreshCw className="h-4 w-4" /></Button>
          </div>

          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center space-y-3">
              <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 text-primary"><LifeBuoy className="h-7 w-7" /></div>
              <p className="font-medium">Nenhum chamado encontrado</p>
              <p className="text-sm text-muted-foreground">Clique em <b>Abrir Novo Chamado</b> para falar com a nossa equipe.</p>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {filtered.map(t => {
                  const p = PRIORITIES.find(x => x.value === t.priority);
                  const st = STATUS_META[t.status] ?? STATUS_META.open;
                  return (
                    <motion.button key={t.id} layout
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      onClick={() => setSelectedId(t.id)}
                      className="group text-left rounded-xl border border-border/60 bg-gradient-to-br from-card to-card/50 p-4 transition hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="min-w-0">
                          <div className="text-[11px] font-mono text-muted-foreground">#{String(t.ticket_number ?? "—").padStart(6, "0")}</div>
                          <div className="font-semibold text-sm truncate">{t.subject}</div>
                        </div>
                        <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        {t.category && <span className="rounded-md bg-muted px-2 py-0.5">{t.category}</span>}
                        {p && <span className={`rounded-md border px-2 py-0.5 ${p.cls}`}>{p.icon} {p.label}</span>}
                        <span className="ml-auto">{new Date(t.last_message_at).toLocaleString("pt-BR")}</span>
                      </div>
                    </motion.button>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>

      <NewTicketDialog open={newOpen} onOpenChange={setNewOpen} userId={userId} onCreated={(id) => { load(); setSelectedId(id); }} />
      <TicketDrawer ticket={selected} onOpenChange={(open) => !open && setSelectedId(null)} userId={userId} onRefresh={load} />
    </PageShell>
  );
}

// ---------- KPI card ----------
function Kpi({ label, value, icon, tone, small }: { label: string; value: number | string; icon: React.ReactNode; tone: string; small?: boolean }) {
  const toneMap: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-500/5 text-blue-500 border-blue-500/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/30",
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-500 border-cyan-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/30",
    muted: "from-muted/60 to-muted/20 text-muted-foreground border-border",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-500 border-violet-500/30",
    fuchsia: "from-fuchsia-500/20 to-fuchsia-500/5 text-fuchsia-500 border-fuchsia-500/30",
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${toneMap[tone]} backdrop-blur-xl p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider opacity-80">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className={`font-bold ${small ? "text-lg" : "text-2xl"} mt-1 text-foreground`}>{value}</div>
    </motion.div>
  );
}

// ---------- New Ticket ----------
function NewTicketDialog({ open, onOpenChange, userId, onCreated }: {
  open: boolean; onOpenChange: (o: boolean) => void; userId: string | null; onCreated: (id: string) => void;
}) {
  const [category, setCategory] = useState<string>("Problema Técnico");
  const [priority, setPriority] = useState<string>("normal");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [environment, setEnvironment] = useState("Desktop");
  const [browser, setBrowser] = useState("Chrome");
  const [pageUrl, setPageUrl] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setEnvironment(detectEnv());
    setBrowser(detectBrowser());
    setPageUrl(window.location.href);
  }, [open]);

  const reset = () => {
    setCategory("Problema Técnico"); setPriority("normal"); setTitle(""); setBody("");
    setFiles([]); setConsent(true); setProgress(0);
  };

  const addFiles = (fs: FileList | File[] | null) => {
    if (!fs) return;
    const list = Array.from(fs).filter(f => f.size <= 25 * 1024 * 1024);
    if (list.length !== Array.from(fs).length) toast.warning("Alguns arquivos passam de 25 MB e foram ignorados");
    setFiles(prev => [...prev, ...list]);
  };

  const submit = async () => {
    if (!title.trim() || !body.trim()) return toast.error("Preencha título e descrição");
    if (!consent) return toast.error("Você precisa autorizar a análise");
    if (!userId) return;
    setBusy(true);
    try {
      const { data: ticket, error } = await supabase.from("support_tickets").insert({
        user_id: userId, subject: title, status: "open",
        category, priority, environment, browser, page_url: pageUrl,
      }).select().single();
      if (error || !ticket) throw error ?? new Error("Falha ao criar ticket");

      const uploaded: Attachment[] = [];
      for (let i = 0; i < files.length; i++) {
        const f = files[i];
        const path = `support/${userId}/${ticket.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage.from("agent-media").upload(path, f, { contentType: f.type, upsert: false });
        if (!upErr) uploaded.push({ path, name: f.name, size: f.size, type: f.type });
        setProgress(Math.round(((i + 1) / files.length) * 100));
      }

      await supabase.from("support_messages").insert({
        ticket_id: ticket.id, sender_id: userId, sender_role: "user", body,
        attachments: uploaded.length ? uploaded : null,
      });
      if (uploaded.length) await supabase.from("support_tickets").update({ attachments: uploaded }).eq("id", ticket.id);

      toast.success(`Chamado #${String(ticket.ticket_number ?? "").padStart(6, "0")} criado com sucesso`);
      onCreated(ticket.id);
      onOpenChange(false); reset();
    } catch (e) {
      toast.error((e as Error).message ?? "Falha ao abrir chamado");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> Abrir Novo Chamado</DialogTitle>
          <DialogDescription>Explique com detalhes o que aconteceu. Quanto mais informação, mais rápido resolvemos.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {PRIORITIES.map(p => (
                  <button key={p.value} type="button" onClick={() => setPriority(p.value)}
                    className={`rounded-lg border px-2 py-2 text-xs font-medium transition ${priority === p.value ? p.cls + " ring-2 ring-offset-1 ring-offset-background" : "border-border text-muted-foreground hover:border-primary/40"}`}>
                    <div className="text-base leading-none">{p.icon}</div><div className="mt-1">{p.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input placeholder="Ex.: Não consigo conectar meu WhatsApp." value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição detalhada</Label>
            <Textarea rows={6} placeholder="Descreva o problema com o máximo de detalhes..." value={body} onChange={e => setBody(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select value={environment} onValueChange={setEnvironment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ENVIRONMENTS.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Navegador</Label>
              <Select value={browser} onValueChange={setBrowser}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{BROWSERS.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>URL da tela</Label>
              <Input value={pageUrl} onChange={e => setPageUrl(e.target.value)} placeholder="Onde ocorreu o problema" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Anexos</Label>
            <div onDragOver={e => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={e => { e.preventDefault(); setDrag(false); addFiles(e.dataTransfer.files); }}
              className={`rounded-xl border-2 border-dashed p-4 text-center transition ${drag ? "border-primary bg-primary/5" : "border-border"}`}>
              <Upload className="h-6 w-6 mx-auto text-muted-foreground mb-1" />
              <div className="text-sm">Arraste arquivos aqui ou <button type="button" className="text-primary underline" onClick={() => fileRef.current?.click()}>selecione</button></div>
              <div className="text-xs text-muted-foreground mt-1">Imagens, vídeos, áudios, PDFs — até 25 MB cada</div>
              <input ref={fileRef} type="file" multiple hidden onChange={e => addFiles(e.target.files)} />
            </div>
            {files.length > 0 && (
              <div className="space-y-1.5">
                {files.map((f, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-2 text-xs">
                    {f.type.startsWith("image/") ? <ImageIcon className="h-4 w-4 text-primary" /> : <FileText className="h-4 w-4 text-primary" />}
                    <span className="truncate flex-1">{f.name}</span>
                    <span className="text-muted-foreground">{fmtSize(f.size)}</span>
                    <button type="button" onClick={() => setFiles(prev => prev.filter((_, k) => k !== i))} className="text-muted-foreground hover:text-destructive"><X className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </div>
            )}
            {busy && files.length > 0 && <Progress value={progress} />}
          </div>

          <label className="flex items-start gap-2 text-sm cursor-pointer">
            <Checkbox checked={consent} onCheckedChange={v => setConsent(!!v)} />
            <span className="text-muted-foreground">Autorizo a equipe técnica a acessar informações deste chamado para análise.</span>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar chamado
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Ticket Drawer ----------
function TicketDrawer({ ticket, onOpenChange, userId, onRefresh }: {
  ticket: Ticket | null; onOpenChange: (o: boolean) => void; userId: string | null; onRefresh: () => void;
}) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [replyFiles, setReplyFiles] = useState<File[]>([]);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [rateOpen, setRateOpen] = useState(false);
  const [rating, setRating] = useState(5);
  const [rateComment, setRateComment] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ticket) { setMessages([]); return; }
    (async () => {
      const { data } = await supabase.from("support_messages").select("*")
        .eq("ticket_id", ticket.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
    })();
    const ch = supabase.channel(`sup-msg-${ticket.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticket.id}` },
        (payload) => setMessages(m => [...m, payload.new as Msg]))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticket]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // sign attachments urls
  useEffect(() => {
    const paths = messages.flatMap(m => m.attachments ?? []).map(a => a.path);
    const missing = paths.filter(p => !signedUrls[p]);
    if (!missing.length) return;
    supabase.storage.from("agent-media").createSignedUrls(missing, 3600).then(({ data }) => {
      if (!data) return;
      const map: Record<string, string> = {};
      data.forEach(d => { if (d.signedUrl && d.path) map[d.path] = d.signedUrl; });
      setSignedUrls(prev => ({ ...prev, ...map }));
    });
  }, [messages, signedUrls]);

  const send = async () => {
    if (!ticket || !userId || (!reply.trim() && replyFiles.length === 0)) return;
    setSending(true);
    try {
      const uploaded: Attachment[] = [];
      for (const f of replyFiles) {
        const path = `support/${userId}/${ticket.id}/${Date.now()}-${f.name}`;
        const { error } = await supabase.storage.from("agent-media").upload(path, f, { contentType: f.type });
        if (!error) uploaded.push({ path, name: f.name, size: f.size, type: f.type });
      }
      const { error } = await supabase.from("support_messages").insert({
        ticket_id: ticket.id, sender_id: userId, sender_role: "user",
        body: reply, attachments: uploaded.length ? uploaded : null,
      });
      if (error) throw error;
      await supabase.from("support_tickets")
        .update({ status: ticket.status === "resolved" || ticket.status === "closed" ? "open" : ticket.status, last_message_at: new Date().toISOString() })
        .eq("id", ticket.id);
      setReply(""); setReplyFiles([]);
      onRefresh();
    } catch (e) { toast.error((e as Error).message); }
    finally { setSending(false); }
  };

  const rate = async () => {
    if (!ticket) return;
    const { error } = await supabase.from("support_tickets")
      .update({ rating, rating_comment: rateComment, status: "closed", closed_at: new Date().toISOString() })
      .eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Obrigado pela avaliação!");
    setRateOpen(false); onRefresh(); onOpenChange(false);
  };

  if (!ticket) return null;
  const st = STATUS_META[ticket.status] ?? STATUS_META.open;
  const p = PRIORITIES.find(x => x.value === ticket.priority);

  return (
    <>
      <Sheet open={!!ticket} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-2xl p-0 flex flex-col">
          <SheetHeader className="p-4 border-b bg-gradient-to-br from-primary/10 to-transparent">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-mono text-muted-foreground">Chamado #{String(ticket.ticket_number ?? "—").padStart(6, "0")}</div>
                <SheetTitle className="text-left truncate">{ticket.subject}</SheetTitle>
                <div className="flex flex-wrap items-center gap-1.5 mt-2">
                  <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  {p && <Badge variant="outline" className={p.cls}>{p.icon} {p.label}</Badge>}
                  {ticket.category && <Badge variant="outline">{ticket.category}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-2 flex flex-wrap gap-x-4 gap-y-0.5">
                  <span>Aberto há {fmtDur(ticket.created_at)}</span>
                  {ticket.environment && <span>{ticket.environment} · {ticket.browser}</span>}
                </div>
              </div>
            </div>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
            {messages.map(m => {
              const mine = m.sender_role === "user";
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card border border-border rounded-bl-sm"}`}>
                    {!mine && <div className="text-[10px] font-semibold opacity-80 mb-0.5">Suporte</div>}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {m.attachments.map((a, i) => {
                          const url = signedUrls[a.path];
                          if (a.type.startsWith("image/") && url) return <img key={i} src={url} alt={a.name} className="rounded-lg max-h-64 object-cover" />;
                          if (a.type.startsWith("audio/") && url) return <audio key={i} controls src={url} className="w-full" />;
                          if (a.type.startsWith("video/") && url) return <video key={i} controls src={url} className="rounded-lg max-h-64 w-full" />;
                          return (
                            <a key={i} href={url ?? "#"} target="_blank" rel="noreferrer"
                              className={`flex items-center gap-2 rounded-lg p-2 text-xs ${mine ? "bg-white/15" : "bg-muted"}`}>
                              <FileText className="h-4 w-4" />
                              <span className="truncate flex-1">{a.name}</span>
                              <span className="opacity-70">{fmtSize(a.size)}</span>
                            </a>
                          );
                        })}
                      </div>
                    )}
                    <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                  </motion.div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {ticket.status !== "closed" && (
            <div className="border-t p-3 space-y-2 bg-background">
              {replyFiles.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {replyFiles.map((f, i) => (
                    <div key={i} className="flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 text-xs">
                      <Paperclip className="h-3 w-3" />{f.name}
                      <button onClick={() => setReplyFiles(prev => prev.filter((_, k) => k !== i))}><X className="h-3 w-3" /></button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex items-end gap-2">
                <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma mensagem..."
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
                <div className="flex flex-col gap-1">
                  <label className="cursor-pointer">
                    <Button variant="outline" size="icon" asChild><span><Paperclip className="h-4 w-4" /></span></Button>
                    <input type="file" multiple hidden onChange={e => e.target.files && setReplyFiles(prev => [...prev, ...Array.from(e.target.files!)])} />
                  </label>
                  <Button onClick={send} size="icon" disabled={sending}>
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              {ticket.status === "resolved" && (
                <Button variant="outline" className="w-full gap-2" onClick={() => setRateOpen(true)}>
                  <Star className="h-4 w-4" /> Avaliar atendimento e encerrar
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <Dialog open={rateOpen} onOpenChange={setRateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Como foi seu atendimento?</DialogTitle>
            <DialogDescription>Sua opinião nos ajuda a melhorar continuamente.</DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setRating(n)}>
                  <Star className={`h-9 w-9 transition ${n <= rating ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
                </button>
              ))}
            </div>
            <Textarea placeholder="Deixe um comentário (opcional)" value={rateComment} onChange={e => setRateComment(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRateOpen(false)}>Cancelar</Button>
            <Button onClick={rate} className="gap-2"><CheckCircle2 className="h-4 w-4" /> Enviar avaliação</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}