import { createFileRoute, Link } from "@tanstack/react-router";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMemo, useState } from "react";
import {
  Activity, MessageSquare, MessagesSquare, Timer, Coins, DollarSign, Plug, Bot,
  Plus, Search, ArrowUpRight, Zap, Users, RefreshCw, Send, Target, CalendarDays,
  TrendingUp, Trophy, XCircle, Smartphone,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, LineChart, Line,
  PieChart, Pie, Cell, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ComposedChart,
} from "recharts";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Plataforma IA" }] }),
  component: Dashboard,
});

const nf = new Intl.NumberFormat("pt-BR");
const cf = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dfDay = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" });
const dfTime = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" });

type Range = { from: Date; to: Date; label: string };

function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
function endOfDay(d: Date) { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

function buildRange(key: string, custom?: { from?: string; to?: string }): Range {
  const now = new Date();
  const today = startOfDay(now);
  switch (key) {
    case "today": return { from: today, to: endOfDay(now), label: "Hoje" };
    case "yesterday": { const y = addDays(today, -1); return { from: y, to: endOfDay(y), label: "Ontem" }; }
    case "7d": return { from: addDays(today, -6), to: endOfDay(now), label: "Últimos 7 dias" };
    case "30d": return { from: addDays(today, -29), to: endOfDay(now), label: "Últimos 30 dias" };
    case "90d": return { from: addDays(today, -89), to: endOfDay(now), label: "Últimos 90 dias" };
    case "month": return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now), label: "Este mês" };
    case "year": return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(now), label: "Este ano" };
    case "custom": {
      const f = custom?.from ? startOfDay(new Date(custom.from)) : addDays(today, -6);
      const t = custom?.to ? endOfDay(new Date(custom.to)) : endOfDay(now);
      return { from: f, to: t, label: "Personalizado" };
    }
    default: return { from: addDays(today, -6), to: endOfDay(now), label: "Últimos 7 dias" };
  }
}

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--accent))", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16", "#f97316", "#3b82f6", "#eab308"];

function DonutWithLegend({ data }: { data: Array<{ name: string; value: number }> }) {
  const total = data.reduce((a, x) => a + x.value, 0);
  return (
    <div className="grid grid-cols-[140px_1fr] gap-4 h-full items-center">
      <div className="relative h-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data.length ? data : [{ name: "—", value: 1 }]} dataKey="value" nameKey="name" innerRadius={48} outerRadius={68} paddingAngle={2} stroke="none">
              {(data.length ? data : [{ name: "—", value: 1 }]).map((_, i) => (
                <Cell key={i} fill={data.length ? CHART_COLORS[i % CHART_COLORS.length] : "hsl(var(--muted))"} />
              ))}
            </Pie>
            {data.length > 0 && <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 grid place-items-center pointer-events-none">
          <div className="text-center">
            <div className="text-lg font-black tabular-nums">{nf.format(total)}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
          </div>
        </div>
      </div>
      <ul className="space-y-2 text-sm max-h-full overflow-auto pr-1">
        {data.length ? data.map((s, i) => {
          const pct = total ? Math.round((s.value / total) * 100) : 0;
          return (
            <li key={s.name + i} className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="truncate flex-1 capitalize">{s.name}</span>
              <span className="tabular-nums text-muted-foreground">{nf.format(s.value)}</span>
              <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{pct}%</span>
            </li>
          );
        }) : <li className="text-sm text-muted-foreground">Sem dados.</li>}
      </ul>
    </div>
  );
}

// Palette used for KPI card tones (matches reference)
const KPI_TONES = [
  { bg: "from-cyan-500/20 to-cyan-500/5",       icon: "bg-cyan-500/20 text-cyan-300 ring-cyan-400/30" },
  { bg: "from-emerald-500/20 to-emerald-500/5", icon: "bg-emerald-500/20 text-emerald-300 ring-emerald-400/30" },
  { bg: "from-sky-500/20 to-sky-500/5",         icon: "bg-sky-500/20 text-sky-300 ring-sky-400/30" },
  { bg: "from-fuchsia-500/20 to-fuchsia-500/5", icon: "bg-fuchsia-500/20 text-fuchsia-300 ring-fuchsia-400/30" },
  { bg: "from-violet-500/20 to-violet-500/5",   icon: "bg-violet-500/20 text-violet-300 ring-violet-400/30" },
  { bg: "from-rose-500/20 to-rose-500/5",       icon: "bg-rose-500/20 text-rose-300 ring-rose-400/30" },
  { bg: "from-amber-500/20 to-amber-500/5",     icon: "bg-amber-500/20 text-amber-300 ring-amber-400/30" },
  { bg: "from-lime-500/20 to-lime-500/5",       icon: "bg-lime-500/20 text-lime-300 ring-lime-400/30" },
  { bg: "from-indigo-500/20 to-indigo-500/5",   icon: "bg-indigo-500/20 text-indigo-300 ring-indigo-400/30" },
  { bg: "from-teal-500/20 to-teal-500/5",       icon: "bg-teal-500/20 text-teal-300 ring-teal-400/30" },
  { bg: "from-orange-500/20 to-orange-500/5",   icon: "bg-orange-500/20 text-orange-300 ring-orange-400/30" },
  { bg: "from-pink-500/20 to-pink-500/5",       icon: "bg-pink-500/20 text-pink-300 ring-pink-400/30" },
];

function Dashboard() {
  const { user } = useAuth();
  const uid = user?.id;

  const [rangeKey, setRangeKey] = useState<string>("7d");
  const [custom, setCustom] = useState<{ from?: string; to?: string }>({});
  const range = useMemo(() => buildRange(rangeKey, custom), [rangeKey, custom]);

  const dash = useQuery({
    queryKey: ["dashboard", uid, range.from.toISOString(), range.to.toISOString()],
    enabled: !!uid,
    queryFn: async () => {
      const fromISO = range.from.toISOString();
      const toISO = range.to.toISOString();
      const todayStart = startOfDay(new Date()).toISOString();
      const todayEnd = endOfDay(new Date()).toISOString();

      const [
        agentsActive, agentsTotal, connsAll, contactsNew, contactsTotal,
        convsRange, msgsRange, broadcasts, broadcastRecipients,
        deals, stages, followupsActive, txsRange, agendaHoje,
        recentConvs,
      ] = await Promise.all([
        supabase.from("agents").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("is_active", true),
        supabase.from("agents").select("id, name", { count: "exact" }).eq("user_id", uid!),
        supabase.from("connections").select("id,name,status,phone_number,message_count").eq("user_id", uid!),
        supabase.from("contacts").select("id", { count: "exact", head: true }).eq("user_id", uid!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("contacts").select("id, source, status", { count: "exact" }).eq("user_id", uid!),
        supabase.from("conversations").select("id, status", { count: "exact" }).eq("user_id", uid!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("messages").select("direction, created_at, conversation_id").eq("user_id", uid!).gte("created_at", fromISO).lte("created_at", toISO).limit(20000),
        supabase.from("broadcasts").select("id, name, status, total, sent_count, error_count, responded_count, created_at").eq("user_id", uid!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("broadcast_recipients").select("status", { count: "exact" }).eq("user_id", uid!).gte("created_at", fromISO).lte("created_at", toISO),
        supabase.from("pipeline_deals").select("id, stage_id, value_cents, created_at").eq("user_id", uid!),
        supabase.from("pipeline_stages").select("id, name, color, is_won, is_lost, position").eq("user_id", uid!).order("position"),
        supabase.from("followups").select("id", { count: "exact", head: true }).eq("user_id", uid!).eq("is_active", true),
        supabase.from("credit_transactions").select("total_tokens, cost_cents, occurred_at").eq("user_id", uid!).eq("kind", "usage").eq("status", "ok").gte("occurred_at", fromISO).lte("occurred_at", toISO).limit(20000),
        supabase.from("pipeline_deals").select("id, title, next_contact_at, company, phone").eq("user_id", uid!).gte("next_contact_at", todayStart).lte("next_contact_at", todayEnd).order("next_contact_at"),
        supabase.from("conversations").select("id, status, last_message_at, unread_count, created_at").eq("user_id", uid!).order("last_message_at", { ascending: false, nullsFirst: false }).limit(6),
      ]);

      const conns = (connsAll.data ?? []) as Array<{ id: string; name: string; status: string; phone_number: string | null; message_count: number }>;
      const contactsList = (contactsTotal.data ?? []) as Array<{ id: string; source: string | null; status: string | null }>;
      const dealsList = (deals.data ?? []) as Array<{ id: string; stage_id: string; value_cents: number | null; created_at: string }>;
      const stageList = (stages.data ?? []) as Array<{ id: string; name: string; color: string | null; is_won: boolean; is_lost: boolean; position: number }>;
      const bcList = (broadcasts.data ?? []) as Array<{ id: string; name: string; status: string; total: number | null; sent_count: number | null; error_count: number | null; responded_count: number | null }>;
      const msgs = (msgsRange.data ?? []) as Array<{ direction: string; created_at: string; conversation_id: string }>;
      const txs = (txsRange.data ?? []) as Array<{ total_tokens: number | null; cost_cents: number | null; occurred_at: string }>;
      const agentsList = (agentsTotal.data ?? []) as Array<{ id: string; name: string }>;

      // Time-series bucketed by day
      const days: string[] = [];
      for (let d = new Date(range.from); d <= range.to; d = addDays(d, 1)) days.push(startOfDay(d).toISOString().slice(0, 10));
      const dayIdx = new Map(days.map((d, i) => [d, i]));
      const series = days.map((d) => ({ day: d, label: dfDay.format(new Date(d)), inbound: 0, outbound: 0, tokens: 0, cost: 0 }));
      for (const m of msgs) {
        const k = m.created_at.slice(0, 10);
        const i = dayIdx.get(k); if (i == null) continue;
        if (m.direction === "inbound") series[i].inbound += 1; else series[i].outbound += 1;
      }
      for (const t of txs) {
        const k = t.occurred_at.slice(0, 10);
        const i = dayIdx.get(k); if (i == null) continue;
        series[i].tokens += Number(t.total_tokens || 0);
        series[i].cost += Number(t.cost_cents || 0) / 100;
      }

      // Pipeline: value + count per stage
      const stageMap = new Map(stageList.map((s) => [s.id, s]));
      const stageAgg = stageList.map((s) => ({ id: s.id, name: s.name, color: s.color ?? undefined, value: 0, count: 0, is_won: s.is_won, is_lost: s.is_lost }));
      const stageIdx = new Map(stageAgg.map((s, i) => [s.id, i]));
      let openCount = 0, wonCount = 0, lostCount = 0, openValue = 0, wonValue = 0;
      for (const dl of dealsList) {
        const i = stageIdx.get(dl.stage_id); if (i == null) continue;
        const v = Number(dl.value_cents || 0) / 100;
        stageAgg[i].value += v; stageAgg[i].count += 1;
        const st = stageMap.get(dl.stage_id)!;
        if (st.is_won) { wonCount += 1; wonValue += v; }
        else if (st.is_lost) { lostCount += 1; }
        else { openCount += 1; openValue += v; }
      }

      // Contacts by source
      const srcMap = new Map<string, number>();
      for (const c of contactsList) { const k = c.source || "Desconhecido"; srcMap.set(k, (srcMap.get(k) ?? 0) + 1); }
      const contactsBySource = [...srcMap.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 8);

      // Broadcasts stacked
      const bcTotals = bcList.reduce((acc, b) => {
        acc.sent += Number(b.sent_count || 0); acc.err += Number(b.error_count || 0); acc.resp += Number(b.responded_count || 0); acc.total += Number(b.total || 0);
        return acc;
      }, { sent: 0, err: 0, resp: 0, total: 0 });
      const bcRecipStatus = new Map<string, number>();
      const recipCount = broadcastRecipients.count ?? 0;
      void recipCount;
      for (const r of ((broadcastRecipients.data ?? []) as Array<{ status: string }>)) {
        bcRecipStatus.set(r.status, (bcRecipStatus.get(r.status) ?? 0) + 1);
      }
      const bcStatusChart = [...bcRecipStatus.entries()].map(([name, value]) => ({ name, value }));

      // Top agentes por mensagens outbound do período — via conversas + agent_id
      const convIds = [...new Set(msgs.map((m) => m.conversation_id))];
      let topAgents: Array<{ name: string; msgs: number }> = [];
      if (convIds.length) {
        const { data: convAgents } = await supabase.from("conversations").select("id, agent_id").in("id", convIds.slice(0, 500));
        const convToAgent = new Map(((convAgents ?? []) as Array<{ id: string; agent_id: string | null }>).map((c) => [c.id, c.agent_id]));
        const agentCount = new Map<string, number>();
        for (const m of msgs) {
          if (m.direction !== "outbound") continue;
          const a = convToAgent.get(m.conversation_id); if (!a) continue;
          agentCount.set(a, (agentCount.get(a) ?? 0) + 1);
        }
        const agentName = new Map(agentsList.map((a) => [a.id, a.name]));
        topAgents = [...agentCount.entries()].map(([id, msgsN]) => ({ name: agentName.get(id) ?? id.slice(0, 6), msgs: msgsN }))
          .sort((a, b) => b.msgs - a.msgs).slice(0, 5);
      }

      const totalTokens = txs.reduce((s, r) => s + Number(r.total_tokens || 0), 0);
      const totalCost = txs.reduce((s, r) => s + Number(r.cost_cents || 0), 0) / 100;
      const inboundN = msgs.filter((m) => m.direction === "inbound").length;
      const outboundN = msgs.length - inboundN;

      return {
        agentsActive: agentsActive.count ?? 0,
        agentsTotal: agentsTotal.count ?? 0,
        connsOnline: conns.filter((c) => c.status === "online").length,
        connsTotal: conns.length,
        conns,
        contactsNew: contactsNew.count ?? 0,
        contactsTotal: contactsTotal.count ?? 0,
        convsRange: convsRange.count ?? 0,
        msgsTotal: msgs.length, inboundN, outboundN,
        broadcasts: bcList, bcTotals, bcStatusChart,
        pipeline: { stageAgg, openCount, wonCount, lostCount, openValue, wonValue },
        followupsActive: followupsActive.count ?? 0,
        totalTokens, totalCost,
        series,
        contactsBySource,
        topAgents,
        agendaHoje: (agendaHoje.data ?? []) as Array<{ id: string; title: string; next_contact_at: string; company: string | null; phone: string | null }>,
        recentConvs: (recentConvs.data ?? []) as Array<{ id: string; status: string; last_message_at: string | null; unread_count: number; created_at: string }>,
      };
    },
  });

  const d = dash.data;
  const fmtWhen = (iso: string | null) => {
    if (!iso) return "—";
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return "agora"; if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60); if (h < 24) return `${h}h`;
    return `${Math.floor(h / 24)}d`;
  };

  const stats = [
    { label: "Agentes ativos", value: d ? `${nf.format(d.agentsActive)}/${nf.format(d.agentsTotal)}` : "—", icon: Bot, tone: "primary", hint: "total" },
    { label: "WhatsApp conectados", value: d ? `${nf.format(d.connsOnline)}/${nf.format(d.connsTotal)}` : "—", icon: Smartphone, tone: "accent", hint: "online" },
    { label: "Contatos", value: d ? nf.format(d.contactsTotal) : "—", icon: Users, tone: "primary", hint: `+${nf.format(d?.contactsNew ?? 0)} no período` },
    { label: "Conversas", value: d ? nf.format(d.convsRange) : "—", icon: MessagesSquare, tone: "accent", hint: range.label },
    { label: "Mensagens", value: d ? nf.format(d.msgsTotal) : "—", icon: MessageSquare, tone: "primary", hint: `${nf.format(d?.inboundN ?? 0)} in · ${nf.format(d?.outboundN ?? 0)} out` },
    { label: "Disparos enviados", value: d ? nf.format(d.bcTotals.sent) : "—", icon: Send, tone: "accent", hint: `${nf.format(d?.bcTotals.resp ?? 0)} respostas` },
    { label: "Pipeline aberto", value: d ? cf.format(d.pipeline.openValue) : "—", icon: Target, tone: "primary", hint: `${nf.format(d?.pipeline.openCount ?? 0)} negócios` },
    { label: "Ganhos", value: d ? cf.format(d.pipeline.wonValue) : "—", icon: Trophy, tone: "accent", hint: `${nf.format(d?.pipeline.wonCount ?? 0)} · ${nf.format(d?.pipeline.lostCount ?? 0)} perdidos` },
    { label: "Follow-ups ativos", value: d ? nf.format(d.followupsActive) : "—", icon: Timer, tone: "primary", hint: "automações" },
    { label: "Tokens", value: d ? nf.format(d.totalTokens) : "—", icon: Coins, tone: "accent", hint: range.label },
    { label: "Custo IA", value: d ? cf.format(d.totalCost) : "—", icon: DollarSign, tone: "primary", hint: range.label },
    { label: "Agenda hoje", value: d ? nf.format(d.agendaHoje.length) : "—", icon: CalendarDays, tone: "accent", hint: "compromissos" },
  ];

  const rangeButtons = [
    { key: "today", label: "Hoje" },
    { key: "yesterday", label: "Ontem" },
    { key: "7d", label: "7d" },
    { key: "30d", label: "30d" },
    { key: "90d", label: "90d" },
    { key: "month", label: "Mês" },
    { key: "year", label: "Ano" },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-[#05070d] px-6 py-4 md:px-8 md:py-5">
        <div className="absolute inset-0 opacity-70" style={{ background: "radial-gradient(1200px 300px at 20% 0%, rgba(59,130,246,0.18), transparent 60%), radial-gradient(800px 260px at 90% 100%, rgba(168,85,247,0.16), transparent 60%)" }} />
        <div className="relative flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <div className="min-w-0 space-y-2 flex-1">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-400/40 bg-blue-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-blue-300">
              <Zap className="h-3 w-3" /> Plataforma IA Premium
            </span>
            <h1 className="text-3xl md:text-4xl font-black tracking-tight leading-none bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(90deg,#3b82f6,#6366f1 45%,#a855f7)" }}>
              Central de Comando
            </h1>
            <p className="text-xs text-muted-foreground max-w-xl">
              Visão consolidada de agentes, WhatsApp, disparos, pipeline e agenda — {range.label.toLowerCase()}.
            </p>
          </div>
          <div className="flex flex-1 items-center justify-center gap-3 flex-nowrap">
            <div className="relative shrink-0">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input placeholder="Buscar agentes, conversas..." className="pl-11 w-72 md:w-96 h-12 text-base rounded-full bg-background/60 border-border text-foreground placeholder:text-muted-foreground" />
            </div>
            <Button onClick={() => dash.refetch()} disabled={dash.isFetching} className="h-12 px-6 text-base shrink-0 rounded-full bg-background text-foreground border border-border hover:bg-muted/60 gap-2">
              <RefreshCw className={`h-5 w-5 ${dash.isFetching ? "animate-spin" : ""}`} /> Atualizar
            </Button>
          </div>
          <div className="hidden lg:flex items-center relative flex-1 justify-end">
              <svg viewBox="0 0 340 160" className="h-20 w-[240px]" fill="none">
                <defs>
                  <linearGradient id="hudStroke" x1="0" x2="1">
                    <stop offset="0%" stopColor="#22d3ee" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                {/* Octagonal frame */}
                <path d="M10 40 L40 15 L200 15 L215 30 L215 130 L200 145 L40 145 L10 120 Z"
                  stroke="url(#hudStroke)" strokeWidth="1.5" opacity="0.9" />
                <path d="M18 48 L45 25 L195 25 L207 37 L207 123 L195 135 L45 135 L18 112 Z"
                  stroke="url(#hudStroke)" strokeWidth="0.75" opacity="0.5" />
                {/* Waveform inside */}
                <path d="M30 100 L55 92 L70 96 L88 78 L108 90 L128 82 L150 92 L172 74 L200 88"
                  stroke="url(#hudStroke)" strokeWidth="1.5" fill="none" opacity="0.9" />
                {/* Circuit ticks */}
                <g stroke="url(#hudStroke)" strokeWidth="1" opacity="0.7">
                  <path d="M215 45 L235 45 L240 50" />
                  <path d="M215 115 L235 115 L240 110" />
                  <path d="M40 15 L40 5 L60 5" />
                  <path d="M180 145 L180 155 L160 155" />
                </g>
                {/* Concentric HUD rings */}
                <circle cx="275" cy="80" r="55" stroke="url(#hudStroke)" strokeWidth="1.5" opacity="0.9" />
                <circle cx="275" cy="80" r="46" stroke="url(#hudStroke)" strokeWidth="0.75" opacity="0.5" strokeDasharray="3 4" />
                <circle cx="275" cy="80" r="34" stroke="url(#hudStroke)" strokeWidth="1" opacity="0.8" />
                <circle cx="275" cy="80" r="22" fill="#0b0620" stroke="url(#hudStroke)" strokeWidth="1" />
                {/* Ring tick marks */}
                {Array.from({ length: 24 }).map((_, i) => {
                  const a = (i / 24) * Math.PI * 2;
                  const x1 = 275 + Math.cos(a) * 58;
                  const y1 = 80 + Math.sin(a) * 58;
                  const x2 = 275 + Math.cos(a) * 63;
                  const y2 = 80 + Math.sin(a) * 63;
                  return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="url(#hudStroke)" strokeWidth="1" opacity="0.6" />;
                })}
                {/* 3x3 dots in center */}
                {Array.from({ length: 9 }).map((_, i) => (
                  <circle key={i} cx={267 + (i % 3) * 8} cy={72 + Math.floor(i / 3) * 8} r="1.6" fill="#a855f7" />
                ))}
                {/* IA Online label */}
                <g>
                  <circle cx="55" cy="80" r="4" fill="#22d3ee" />
                  <text x="70" y="85" fill="#e0f2fe" fontSize="16" fontWeight="700" fontFamily="ui-sans-serif, system-ui">IA Online</text>
                </g>
              </svg>
            </div>
        </div>
      </div>

      {/* Range filter */}
      <Card className="border-border/50">
        <CardContent className="p-3 flex flex-wrap items-center gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">Período</span>
          {rangeButtons.map((r) => (
            <Button key={r.key} size="sm" variant={rangeKey === r.key ? "default" : "outline"} onClick={() => setRangeKey(r.key)}>{r.label}</Button>
          ))}
          <div className="flex items-center gap-2 ml-auto">
            <Input type="date" value={custom.from ?? ""} onChange={(e) => { setCustom((c) => ({ ...c, from: e.target.value })); setRangeKey("custom"); }} className="h-9 w-40" />
            <span className="text-muted-foreground text-sm">até</span>
            <Input type="date" value={custom.to ?? ""} onChange={(e) => { setCustom((c) => ({ ...c, to: e.target.value })); setRangeKey("custom"); }} className="h-9 w-40" />
            <Button size="sm" variant={rangeKey === "custom" ? "default" : "outline"} onClick={() => setRangeKey("custom")}>Aplicar</Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-4">
        {stats.map((s, i) => {
          const tone = KPI_TONES[i % KPI_TONES.length];
          return (
            <Card key={s.label} className="group relative overflow-hidden border-border/50 hover:border-primary/40 transition-all hover:-translate-y-0.5">
              <div className={`absolute inset-0 bg-gradient-to-br ${tone.bg} pointer-events-none`} />
              <CardHeader className="relative pb-1 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">{s.label}</CardTitle>
                <div className={`grid h-9 w-9 place-items-center rounded-xl ring-1 ${tone.icon}`}>
                  <s.icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="relative space-y-1">
                <div className="text-2xl font-black tabular-nums">{s.value}</div>
                <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <ArrowUpRight className="h-3 w-3" /> {s.hint}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Charts row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Mensagens por dia</CardTitle>
            <CardDescription>Entrada vs saída — {range.label.toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={d?.series ?? []}>
                <defs>
                  <linearGradient id="gIn" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} /><stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gOut" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} /><stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Area type="monotone" dataKey="inbound" name="Recebidas" stroke="hsl(var(--primary))" fill="url(#gIn)" />
                <Area type="monotone" dataKey="outbound" name="Enviadas" stroke="hsl(var(--accent))" fill="url(#gOut)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Target className="h-4 w-4 text-primary" /> Pipeline por estágio</CardTitle>
            <CardDescription>Valor em aberto</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <div className="grid grid-cols-[160px_1fr] gap-4 h-full items-center">
              <div className="relative h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={(d?.pipeline.stageAgg ?? []).filter((s) => s.value > 0)} dataKey="value" nameKey="name" innerRadius={55} outerRadius={78} paddingAngle={2} stroke="none">
                      {(d?.pipeline.stageAgg ?? []).map((s, i) => <Cell key={s.id} fill={s.color || CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => cf.format(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="text-center">
                    <div className="text-lg font-black">{cf.format(d?.pipeline.openValue ?? 0)}</div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                  </div>
                </div>
              </div>
              <ul className="space-y-2 text-sm max-h-full overflow-auto pr-1">
                {(d?.pipeline.stageAgg ?? []).map((s, i) => {
                  const total = (d?.pipeline.stageAgg ?? []).reduce((a, x) => a + x.value, 0) || 1;
                  const pct = Math.round((s.value / total) * 100);
                  return (
                    <li key={s.id} className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: s.color || CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="truncate flex-1">{s.name}</span>
                      <span className="tabular-nums text-muted-foreground">{cf.format(s.value)}</span>
                      <span className="tabular-nums text-xs text-muted-foreground w-10 text-right">{pct}%</span>
                    </li>
                  );
                })}
                {!(d?.pipeline.stageAgg?.length) && <li className="text-sm text-muted-foreground">Sem dados.</li>}
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 2 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Send className="h-4 w-4 text-primary" /> Disparos por status</CardTitle>
            <CardDescription>Destinatários do período</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <DonutWithLegend data={d?.bcStatusChart ?? []} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Users className="h-4 w-4 text-primary" /> Contatos por origem</CardTitle>
            <CardDescription>Top canais</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <DonutWithLegend data={d?.contactsBySource ?? []} />
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Coins className="h-4 w-4 text-primary" /> Tokens & custo/dia</CardTitle>
            <CardDescription>Consumo do gateway IA</CardDescription>
          </CardHeader>
          <CardContent className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={d?.series ?? []}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="label" fontSize={11} />
                <YAxis yAxisId="left" fontSize={11} />
                <YAxis yAxisId="right" orientation="right" fontSize={11} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar yAxisId="left" dataKey="tokens" name="Tokens" fill="hsl(var(--primary))" radius={[6, 6, 0, 0]} barSize={14} />
                <Line yAxisId="right" type="monotone" dataKey="cost" name="Custo (R$)" stroke="#f59e0b" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Charts row 3 — top agents + agenda + connections */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><Bot className="h-4 w-4 text-primary" /> Top agentes</CardTitle>
            <CardDescription>Mensagens enviadas no período</CardDescription>
          </CardHeader>
          <CardContent className="h-64 overflow-auto pr-1">
            {d && d.topAgents.length ? (
              <ul className="space-y-3">
                {(() => {
                  const max = Math.max(...d.topAgents.map((a) => a.msgs), 1);
                  return d.topAgents.map((a, i) => (
                    <li key={a.name} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="truncate font-medium">{i + 1}. {a.name}</span>
                        <span className="tabular-nums text-muted-foreground">{nf.format(a.msgs)}</span>
                      </div>
                      <div className="h-2 rounded-full bg-muted/40 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(a.msgs / max) * 100}%`, background: "var(--gradient-primary)" }} />
                      </div>
                    </li>
                  ));
                })()}
              </ul>
            ) : (
              <div className="h-full grid place-items-center text-sm text-muted-foreground">Sem dados no período.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Agenda de hoje</CardTitle>
              <CardDescription>Próximos contatos do pipeline</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/pipeline">Abrir <ArrowUpRight className="h-3 w-3" /></Link></Button>
          </CardHeader>
          <CardContent>
            {d && d.agendaHoje.length ? (
              <ul className="space-y-2 max-h-56 overflow-auto pr-1">
                {d.agendaHoje.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border border-border/50 rounded-lg p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{a.title}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{a.company ?? a.phone ?? "—"}</div>
                    </div>
                    <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">{dfTime.format(new Date(a.next_contact_at))}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-sm text-muted-foreground">Sem compromissos para hoje.</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2"><Smartphone className="h-4 w-4 text-primary" /> WhatsApps</CardTitle>
              <CardDescription>Status das conexões</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm"><Link to="/connections">Gerenciar <ArrowUpRight className="h-3 w-3" /></Link></Button>
          </CardHeader>
          <CardContent>
            {d && d.conns.length ? (
              <ul className="space-y-2 max-h-56 overflow-auto pr-1">
                {d.conns.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border border-border/50 rounded-lg p-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{c.name}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{c.phone_number ?? "—"} · {nf.format(c.message_count)} msgs</div>
                    </div>
                    {c.status === "online" ? (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30">online</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-red-500/15 text-red-600 border-red-500/30"><XCircle className="h-3 w-3" /> {c.status}</Badge>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-xl border border-dashed border-border/60 p-8 text-center space-y-2">
                <p className="text-sm text-muted-foreground">Nenhuma conexão.</p>
                <Button asChild variant="outline" size="sm"><Link to="/connections"><Plug className="h-3.5 w-3.5" /> Conectar</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Últimas conversas */}
      <Card className="border-border/50">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2"><Activity className="h-4 w-4 text-primary" /> Últimas conversas</CardTitle>
            <CardDescription>Interações mais recentes dos seus agentes</CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm"><Link to="/conversations">Ver todas <ArrowUpRight className="h-3 w-3" /></Link></Button>
        </CardHeader>
        <CardContent>
          {d && d.recentConvs.length > 0 ? (
            <ul className="divide-y divide-border/50">
              {d.recentConvs.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-3 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="grid h-9 w-9 place-items-center rounded-full bg-primary/10 text-primary shrink-0">
                      <MessagesSquare className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">Conversa {c.id.slice(0, 8)}</div>
                      <div className="text-[11px] text-muted-foreground">{c.status} · {fmtWhen(c.last_message_at ?? c.created_at)}</div>
                    </div>
                  </div>
                  {c.unread_count > 0 && (
                    <Badge variant="outline" className="bg-primary/15 text-primary border-primary/40">{c.unread_count}</Badge>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 p-10 text-center text-sm text-muted-foreground">Nenhuma conversa no período.</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}