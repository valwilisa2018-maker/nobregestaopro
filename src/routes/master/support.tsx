import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  LifeBuoy, Loader2, Send, CheckCircle2, Phone, Mail, MessageCircle, Save,
  Search, Activity, Clock, X, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/support")({
  head: () => ({ meta: [{ title: "Suporte — Admin Master" }] }),
  component: Page,
});

type Ticket = {
  id: string; user_id: string; ticket_number: number | null; subject: string;
  status: string; priority: string | null; category: string | null;
  first_response_at: string | null; resolved_at: string | null;
  last_message_at: string; created_at: string;
};
type Msg = { id: string; ticket_id: string; sender_id: string; sender_role: string; body: string; created_at: string };
type SupportContacts = { phone?: string; email?: string; whatsapp?: string; whatsapp_message?: string };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Aberto", cls: "bg-blue-500/15 text-blue-500 border-blue-500/40" },
  in_analysis: { label: "Em análise", cls: "bg-violet-500/15 text-violet-500 border-violet-500/40" },
  in_progress: { label: "Em andamento", cls: "bg-amber-500/15 text-amber-500 border-amber-500/40" },
  pending: { label: "Aguardando cliente", cls: "bg-cyan-500/15 text-cyan-500 border-cyan-500/40" },
  waiting_dev: { label: "Aguardando dev", cls: "bg-fuchsia-500/15 text-fuchsia-500 border-fuchsia-500/40" },
  resolved: { label: "Resolvido", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" },
  closed: { label: "Fechado", cls: "bg-muted text-muted-foreground border-border" },
  cancelled: { label: "Cancelado", cls: "bg-red-500/15 text-red-500 border-red-500/40" },
};
const PRIORITIES = [
  { value: "low", label: "Baixa", icon: "🟢" },
  { value: "normal", label: "Normal", icon: "🟡" },
  { value: "high", label: "Alta", icon: "🟠" },
  { value: "urgent", label: "Urgente", icon: "🔴" },
];
const NEXT_STATUS = ["open", "in_analysis", "in_progress", "pending", "waiting_dev", "resolved", "closed"];

function fmtDur(ms: number) {
  if (!ms) return "—";
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}min`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function Page() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [savingContacts, setSavingContacts] = useState(false);
  const [search, setSearch] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fPriority, setFPriority] = useState("all");

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("support_tickets").select("*").order("last_message_at", { ascending: false }).limit(500);
    setTickets((data as Ticket[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel("master-sup-tickets")
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [load]);

  useEffect(() => {
    supabase.from("internal_config").select("value").eq("key", "support_contacts").maybeSingle()
      .then(({ data }) => {
        if (!data?.value) return;
        try { setContacts(JSON.parse(data.value) as SupportContacts); } catch { /* ignore */ }
      });
  }, []);

  const saveContacts = async () => {
    setSavingContacts(true);
    const value = JSON.stringify(contacts);
    const { data: existing } = await supabase.from("internal_config").select("key").eq("key", "support_contacts").maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "support_contacts")
      : await supabase.from("internal_config").insert({ key: "support_contacts", value });
    setSavingContacts(false);
    if (error) toast.error(error.message); else toast.success("Contatos de suporte salvos");
  };

  useEffect(() => {
    if (!selected) return;
    (async () => {
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selected.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
    })();
  }, [selected]);

  const send = async () => {
    if (!reply.trim() || !selected) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setSending(true);
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: selected.id, sender_id: user.id, sender_role: "master", body: reply,
    });
    if (!error) {
      const patch: Record<string, unknown> = { last_message_at: new Date().toISOString() };
      if (!selected.first_response_at) patch.first_response_at = new Date().toISOString();
      if (selected.status === "open") patch.status = "in_progress";
      await supabase.from("support_tickets").update(patch).eq("id", selected.id);
      setReply("");
      const { data } = await supabase.from("support_messages").select("*").eq("ticket_id", selected.id).order("created_at");
      setMessages((data as Msg[]) ?? []);
      load();
    } else toast.error(error.message);
    setSending(false);
  };

  const setStatus = async (status: string) => {
    if (!selected) return;
    const patch: Record<string, unknown> = { status };
    if (status === "resolved") patch.resolved_at = new Date().toISOString();
    if (status === "closed") patch.closed_at = new Date().toISOString();
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", selected.id);
    if (error) toast.error(error.message); else { toast.success(`Status atualizado`); load(); }
  };

  const setPriority = async (priority: string) => {
    if (!selected) return;
    const { error } = await supabase.from("support_tickets").update({ priority }).eq("id", selected.id);
    if (error) toast.error(error.message); else load();
  };

  // ---------- KPIs ----------
  const stats = useMemo(() => {
    const c = (arr: string[]) => tickets.filter(t => arr.includes(t.status)).length;
    const responded = tickets.filter(t => t.first_response_at);
    const avgResp = responded.length
      ? responded.reduce((s, t) => s + (new Date(t.first_response_at!).getTime() - new Date(t.created_at).getTime()), 0) / responded.length
      : 0;
    const resolved = tickets.filter(t => t.resolved_at);
    const avgRes = resolved.length
      ? resolved.reduce((s, t) => s + (new Date(t.resolved_at!).getTime() - new Date(t.created_at).getTime()), 0) / resolved.length
      : 0;
    const urgent = tickets.filter(t => t.priority === "urgent" && !["resolved", "closed", "cancelled"].includes(t.status)).length;
    return {
      total: tickets.length,
      open: c(["open"]),
      inProgress: c(["in_analysis", "in_progress", "waiting_dev"]),
      pending: c(["pending"]),
      resolved: c(["resolved"]),
      closed: c(["closed"]),
      urgent,
      avgResp: fmtDur(avgResp),
      avgRes: fmtDur(avgRes),
    };
  }, [tickets]);

  const filtered = useMemo(() => tickets.filter(t => {
    if (fStatus !== "all" && t.status !== fStatus) return false;
    if (fPriority !== "all" && t.priority !== fPriority) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!t.subject.toLowerCase().includes(q)
        && !String(t.ticket_number ?? "").includes(q)
        && !t.user_id.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [tickets, fStatus, fPriority, search]);

  return (
    <PageShell title="Suporte — Master" description="KPIs, filtros e atendimento dos chamados dos clientes." icon={<LifeBuoy className="h-6 w-6" />} status="ativo"
      actions={<Button variant="outline" size="sm" onClick={load} className="gap-2"><RefreshCw className="h-4 w-4" /> Atualizar</Button>}
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-8 gap-3">
        <Kpi label="Total" value={stats.total} tone="muted" icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Abertos" value={stats.open} tone="blue" icon={<Activity className="h-4 w-4" />} />
        <Kpi label="Em andamento" value={stats.inProgress} tone="amber" icon={<Loader2 className="h-4 w-4" />} />
        <Kpi label="Aguardando" value={stats.pending} tone="cyan" icon={<Clock className="h-4 w-4" />} />
        <Kpi label="Resolvidos" value={stats.resolved} tone="emerald" icon={<CheckCircle2 className="h-4 w-4" />} />
        <Kpi label="Fechados" value={stats.closed} tone="muted" icon={<X className="h-4 w-4" />} />
        <Kpi label="Urgentes ativos" value={stats.urgent} tone="red" icon={<Activity className="h-4 w-4" />} />
        <Kpi label="TMR / TMResol" value={`${stats.avgResp} / ${stats.avgRes}`} tone="violet" icon={<Clock className="h-4 w-4" />} small />
      </div>

      {/* Contatos do cliente */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
        <CardContent className="p-5 space-y-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2"><MessageCircle className="h-4 w-4 text-primary" /> Canais de contato exibidos ao cliente</h3>
            <p className="text-xs text-muted-foreground mt-1">Aparecem no topo da página de Suporte de cada cliente.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp (com DDI)</Label>
              <Input placeholder="+5511999999999" value={contacts.whatsapp ?? ""} onChange={e => setContacts(c => ({ ...c, whatsapp: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><Phone className="h-3.5 w-3.5 text-primary" /> Telefone</Label>
              <Input placeholder="(11) 9999-9999" value={contacts.phone ?? ""} onChange={e => setContacts(c => ({ ...c, phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-2 text-xs"><Mail className="h-3.5 w-3.5 text-blue-500" /> E-mail</Label>
              <Input type="email" placeholder="suporte@empresa.com" value={contacts.email ?? ""} onChange={e => setContacts(c => ({ ...c, email: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Mensagem inicial do WhatsApp (opcional)</Label>
            <Input placeholder="Olá, preciso de ajuda com..." value={contacts.whatsapp_message ?? ""} onChange={e => setContacts(c => ({ ...c, whatsapp_message: e.target.value }))} />
          </div>
          <div className="flex justify-end">
            <Button onClick={saveContacts} disabled={savingContacts} className="gap-2">
              {savingContacts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar contatos
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filtros */}
      <Card>
        <CardContent className="p-4 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por título, #número ou user id" className="pl-9" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <Select value={fStatus} onValueChange={setFStatus}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={fPriority} onValueChange={setFPriority}>
            <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas prioridades</SelectItem>
              {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <Card><CardContent className="p-0 max-h-[70vh] overflow-y-auto">
            {filtered.map(t => {
              const st = STATUS_META[t.status] ?? STATUS_META.open;
              const p = PRIORITIES.find(x => x.value === t.priority);
              return (
                <button key={t.id} onClick={() => setSelected(t)}
                  className={`w-full text-left p-3 border-b hover:bg-muted/40 ${selected?.id === t.id ? "bg-muted/40" : ""}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[10px] font-mono text-muted-foreground">#{String(t.ticket_number ?? "—").padStart(6, "0")}</div>
                      <div className="font-medium text-sm truncate">{t.subject}</div>
                    </div>
                    <Badge variant="outline" className={st.cls}>{st.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    {p && <span>{p.icon} {p.label}</span>}
                    <span className="ml-auto">{new Date(t.last_message_at).toLocaleString("pt-BR")}</span>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && <div className="p-8 text-center text-muted-foreground text-sm">Nenhum ticket.</div>}
          </CardContent></Card>

          <Card>
            <CardContent className="p-4 flex flex-col h-[70vh]">
              {!selected ? (
                <div className="flex-1 grid place-items-center text-muted-foreground">Selecione um ticket</div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                    <div className="min-w-0">
                      <h3 className="font-semibold truncate">{selected.subject}</h3>
                      <p className="text-xs text-muted-foreground">
                        Cliente {selected.user_id.slice(0, 8)} · Criado {new Date(selected.created_at).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Select value={selected.priority ?? "normal"} onValueChange={setPriority}>
                        <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.icon} {p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={selected.status} onValueChange={setStatus}>
                        <SelectTrigger className="w-[170px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {NEXT_STATUS.map(s => <SelectItem key={s} value={s}>{STATUS_META[s]?.label ?? s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto py-3 space-y-2">
                    {messages.map(m => (
                      <div key={m.id} className={`flex ${m.sender_role === "master" ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.sender_role === "master" ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                          <p className="text-[10px] opacity-70 mt-1">{new Date(m.created_at).toLocaleString("pt-BR")}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 border-t pt-3">
                    <Textarea rows={2} value={reply} onChange={e => setReply(e.target.value)} placeholder="Escreva uma resposta..." />
                    <Button onClick={send} disabled={sending || !reply.trim()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function Kpi({ label, value, tone, icon, small }: { label: string; value: number | string; tone: string; icon: React.ReactNode; small?: boolean }) {
  const toneMap: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-500/5 text-blue-500 border-blue-500/30",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500 border-amber-500/30",
    cyan: "from-cyan-500/20 to-cyan-500/5 text-cyan-500 border-cyan-500/30",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 border-emerald-500/30",
    muted: "from-muted/60 to-muted/20 text-muted-foreground border-border",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-500 border-violet-500/30",
    red: "from-red-500/20 to-red-500/5 text-red-500 border-red-500/30",
  };
  return (
    <div className={`relative overflow-hidden rounded-xl border bg-gradient-to-br ${toneMap[tone]} backdrop-blur-xl p-3`}>
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wider opacity-80">{label}</span>
        <div className="opacity-80">{icon}</div>
      </div>
      <div className={`font-bold ${small ? "text-base" : "text-2xl"} mt-1 text-foreground`}>{value}</div>
    </div>
  );
}
