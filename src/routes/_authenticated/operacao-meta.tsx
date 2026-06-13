import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Target, Trophy, Folder, RefreshCw, Users, Sparkles, Crown,
  Rocket, Flame, TrendingUp, Calendar, MessageSquare,
  CheckCircle2, Star, Zap,
} from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  RadialBarChart, RadialBar, PolarAngleAxis,
} from "recharts";

export const Route = createFileRoute("/_authenticated/operacao-meta")({
  component: OperacaoMetaPage,
});

const ymd = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
const today = () => ymd(new Date());
const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return ymd(d); };
const monthStart = () => { const d = new Date(); d.setDate(1); return ymd(d); };
const fmtBR = (iso: string) => { const [, m, d] = iso.split("-"); return `${d}/${m}`; };

function OperacaoMetaPage() {
  const qc = useQueryClient();

  const producers = useQuery({
    queryKey: ["om-producers"],
    queryFn: async () =>
      (await supabase.from("producers").select("id,name,daily_points_goal,active,avatar_url")).data ?? [],
  });

  const orders = useQuery({
    queryKey: ["om-orders"],
    queryFn: async () =>
      (
        await supabase
          .from("service_orders")
          .select(
            "id,producer_id,sale_id,delivered_at,updated_at,sales(service_type_id,package_id,video_duration_seconds,service_types(name,points_value),packages(name,points_value))",
          )
      ).data ?? [],
  });

  const computePts = (o: any) => {
    const sale: any = o.sales || {};
    const base = Number((sale.packages?.points_value ?? sale.service_types?.points_value) ?? 0);
    const dur = Number(sale.video_duration_seconds ?? 0);
    return base * (dur >= 30 ? dur / 30 : 1);
  };
  const catName = (o: any) => {
    const s: any = o.sales || {};
    return s.packages?.name ?? s.service_types?.name ?? "Outro";
  };

  const delivered = useMemo(
    () => (orders.data ?? []).filter((o: any) => !!o.delivered_at),
    [orders.data],
  );

  // Distinct delivery dates (sorted desc)
  const dates = useMemo(() => {
    const s = new Set<string>();
    for (const o of delivered) s.add(String(o.delivered_at).slice(0, 10));
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [delivered]);

  const [selectedDate, setSelectedDate] = useState<string>(today());
  useEffect(() => {
    if (dates.length && !dates.includes(selectedDate)) setSelectedDate(dates[0]);
  }, [dates]);

  const onDate = (iso: string) => delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) === iso);

  // -------- KPIs HOJE (top hero) --------
  const t = today(), y = yesterday(), ms = monthStart();
  const todayOrders = onDate(t);
  const yOrders = onDate(y);
  const monthOrders = useMemo(
    () => delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) >= ms),
    [delivered, ms],
  );

  const sumPts = (arr: any[]) => arr.reduce((a, o) => a + computePts(o), 0);
  const todayPts = sumPts(todayOrders);
  const yPts = sumPts(yOrders);
  const monthPts = sumPts(monthOrders);

  const totalGoalToday = (producers.data ?? [])
    .filter((p: any) => p.active !== false)
    .reduce((a: number, p: any) => a + Number(p.daily_points_goal ?? 7), 0);

  const pct = totalGoalToday > 0 ? Math.min(100, Math.round((todayPts / totalGoalToday) * 100)) : 0;
  const diffYesterday = todayPts - yPts;

  const statusLabel =
    pct >= 100 ? { title: "Meta batida!", emoji: "🏆", color: "#10b981" } :
    pct >= 70  ? { title: "Quase lá!", emoji: "🔥", color: "#f59e0b" } :
    pct >= 30  ? { title: "No ritmo!", emoji: "🚀", color: "#3b82f6" } :
                 { title: "Vamos lá!", emoji: "🚀", color: "#ef4444" };

  // Top performers (all time)
  const topPerformers = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of delivered) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => {
        const prod: any = (producers.data ?? []).find((x: any) => x.id === pid);
        return { id: pid, name: prod?.name ?? "—", avatar: prod?.avatar_url, points: p };
      })
      .sort((a, b) => b.points - a.points)
      .slice(0, 5);
  }, [delivered, producers.data]);

  const projetosTotal = delivered.length;
  const produtoresAtivos = (producers.data ?? []).filter((p: any) => p.active !== false).length;
  const alteracoes = useMemo(
    () => (orders.data ?? []).filter((o: any) => o.updated_at && o.delivered_at && o.updated_at !== o.delivered_at).length,
    [orders.data],
  );

  // MVP (top all-time)
  const mvp = topPerformers[0];

  // Melhor dia (best day by points)
  const bestDay = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of delivered) {
      const d = String(o.delivered_at).slice(0, 10);
      m.set(d, (m.get(d) ?? 0) + computePts(o));
    }
    let best = { date: "", pts: 0 };
    for (const [d, p] of m.entries()) if (p > best.pts) best = { date: d, pts: p };
    return best;
  }, [delivered]);

  // Ranking do dia (today)
  const todayRanking = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => {
        const prod: any = (producers.data ?? []).find((x: any) => x.id === pid);
        return { name: prod?.name ?? "—", points: Number(p.toFixed(1)) };
      })
      .sort((a, b) => b.points - a.points);
  }, [todayOrders, producers.data]);

  const todayCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) m.set(catName(o), (m.get(catName(o)) ?? 0) + 1);
    return Array.from(m.entries()).map(([n, c]) => ({ name: n, count: c })).sort((a, b) => b.count - a.count);
  }, [todayOrders]);

  // -------- HISTÓRICO (selected date) --------
  const selOrders = onDate(selectedDate);
  const selPts = sumPts(selOrders);
  const selProjetos = selOrders.length;
  const selAlteracoes = selOrders.filter((o: any) => o.updated_at && o.updated_at !== o.delivered_at).length;
  const selProdutores = new Set(selOrders.map((o: any) => o.producer_id).filter(Boolean)).size;
  const selGoal = (producers.data ?? [])
    .filter((p: any) => p.active !== false)
    .reduce((a: number, p: any) => a + Number(p.daily_points_goal ?? 7), 0);
  const selPct = selGoal > 0 ? Math.min(100, Math.round((selPts / selGoal) * 100)) : 0;

  const selRanking = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of selOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => {
        const prod: any = (producers.data ?? []).find((x: any) => x.id === pid);
        return { name: (prod?.name ?? "—").toUpperCase(), value: Number(p.toFixed(1)) };
      })
      .sort((a, b) => b.value - a.value);
  }, [selOrders, producers.data]);

  const selCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of selOrders) m.set(catName(o), (m.get(catName(o)) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([n, c]) => ({ name: n.toUpperCase(), count: c }))
      .sort((a, b) => b.count - a.count);
  }, [selOrders]);

  const updateGoal = async (id: string, v: string) => {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) { toast.error("Meta inválida"); return; }
    const { error } = await supabase.from("producers").update({ daily_points_goal: n }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Meta atualizada"); qc.invalidateQueries({ queryKey: ["om-producers"] });
  };

  const initials = (n?: string) => (n ?? "?").split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" /> Operação Meta
          </h1>
          <p className="text-muted-foreground text-sm">Painel premium de pontuação por produtor</p>
        </div>
      </div>

      {/* ============= TOP GRID ============= */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        {/* META DO DIA — spans 2 cols */}
        <Card className="lg:col-span-2 border-border/50 overflow-hidden" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-4 flex items-center gap-1.5">
              <Target className="w-3 h-3" /> Meta do Dia
            </div>
            <div className="grid grid-cols-3 gap-4 items-center">
              {/* Left: vs ontem + ontem */}
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-medium">
                    <TrendingUp className="w-3 h-3" /> vs Ontem
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${diffYesterday >= 0 ? "text-emerald-500" : "text-red-500"}`}>
                    {diffYesterday >= 0 ? "+" : ""}{diffYesterday.toFixed(0)}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-medium">
                    <Calendar className="w-3 h-3" /> Ontem
                  </div>
                  <div className="text-xl font-bold mt-1">{yPts > 0 ? `${yPts.toFixed(0)}` : "--"} <span className="text-xs text-muted-foreground">pts</span></div>
                </div>
              </div>

              {/* Center: ring */}
              <div className="h-[180px] relative flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <RadialBarChart innerRadius="78%" outerRadius="100%" data={[{ name: "pct", value: pct, fill: statusLabel.color }]} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                    <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "hsl(var(--muted) / 0.3)" }} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <div className="text-3xl font-extrabold">{pct}%</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{todayPts.toFixed(0)} / {totalGoalToday} pts</div>
                </div>
              </div>

              {/* Right: status + pontos do mês */}
              <div className="space-y-2">
                <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-medium">
                    <MessageSquare className="w-3 h-3" /> Status
                  </div>
                  <div className="text-2xl mt-1">{statusLabel.emoji}</div>
                  <div className="text-base font-bold leading-tight">{statusLabel.title}</div>
                </div>
                <div className="p-3 rounded-xl bg-muted/40 border border-border/40">
                  <div className="text-[10px] uppercase text-muted-foreground flex items-center gap-1 font-medium">
                    <Sparkles className="w-3 h-3" /> Pontos do Mês
                  </div>
                  <div className="text-xl font-bold mt-1">{monthPts.toFixed(0)}</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TOP PERFORMERS */}
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <Crown className="w-3 h-3 text-amber-500" /> Top Performers
            </div>
            {topPerformers.length === 0 ? (
              <div className="h-[180px] flex items-center justify-center text-sm text-muted-foreground">Sem dados ainda</div>
            ) : (
              <div className="space-y-2">
                {topPerformers.map((p, i) => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/30">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-zinc-400 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-muted text-muted-foreground"}`}>{i + 1}</div>
                    <Avatar className="w-7 h-7"><AvatarImage src={p.avatar} /><AvatarFallback className="text-[10px]">{initials(p.name)}</AvatarFallback></Avatar>
                    <div className="flex-1 truncate text-sm font-medium">{p.name}</div>
                    <div className="text-sm font-bold">{p.points.toFixed(0)} <span className="text-[10px] text-muted-foreground">pts</span></div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* PROJETOS + ALTERAÇÕES stacked */}
        <div className="flex flex-col gap-3">
          <Card className="border-border/50 flex-1" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-1 flex items-center gap-1.5 self-start">
                <Folder className="w-3 h-3 text-amber-500" /> Projetos
              </div>
              <div className="text-5xl font-extrabold mt-1">{projetosTotal}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{produtoresAtivos} produtores ativos</div>
            </CardContent>
          </Card>
          <Card className="border-border/50 flex-1" style={{ boxShadow: "var(--shadow-card)" }}>
            <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
              <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-1 flex items-center gap-1.5 self-start">
                <RefreshCw className="w-3 h-3 text-blue-500" /> Alterações
              </div>
              <div className="text-5xl font-extrabold mt-1">{alteracoes}</div>
              <div className="text-[11px] text-muted-foreground mt-1">alterações</div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ============= SECOND ROW ============= */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <Trophy className="w-3 h-3 text-amber-500" /> Ranking do Dia
            </div>
            {todayRanking.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem dados ainda</div>
            ) : (
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={todayRanking} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={80} />
                    <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                    <Bar dataKey="points" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-pink-500" /> Categorias do Dia
            </div>
            {todayCategories.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem categorias</div>
            ) : (
              <div className="space-y-2">
                {todayCategories.slice(0, 6).map((c, i) => (
                  <div key={c.name} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-bold text-muted-foreground">#{i + 1}</span>
                      <span className="text-sm font-medium truncate uppercase">{c.name}</span>
                    </div>
                    <span className="text-sm font-bold">{c.count}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* DESTAQUES */}
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
              <Star className="w-3 h-3 text-amber-500" /> Destaques
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-xl border border-border/40 bg-muted/30 text-center">
                <div className="text-[10px] uppercase text-muted-foreground flex items-center justify-center gap-1"><Trophy className="w-3 h-3" /> MVP</div>
                {mvp ? (
                  <>
                    <Avatar className="w-10 h-10 mx-auto my-2"><AvatarImage src={(mvp as any).avatar} /><AvatarFallback className="text-xs">{initials(mvp.name)}</AvatarFallback></Avatar>
                    <div className="text-xs font-bold truncate">{mvp.name}</div>
                  </>
                ) : (<div className="text-2xl my-2">--</div>)}
              </div>
              <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-center">
                <div className="text-[10px] uppercase text-amber-500 flex items-center justify-center gap-1 font-semibold"><Flame className="w-3 h-3" /> Melhor Dia</div>
                <div className="text-2xl font-extrabold text-amber-500 mt-2">{bestDay.date ? fmtBR(bestDay.date) : "--"}</div>
                <div className="text-[10px] text-muted-foreground mt-1">{bestDay.pts.toFixed(0)} pts</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ============= HISTÓRICO DIÁRIO ============= */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5 space-y-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1.5">
            <Calendar className="w-3 h-3 text-violet-500" /> Histórico Diário
          </div>

          {/* date pills */}
          {dates.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma entrega registrada.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {dates.slice(0, 30).map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDate(d)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    selectedDate === d ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted text-muted-foreground"
                  }`}
                >{fmtBR(d)}</button>
              ))}
            </div>
          )}

          {/* KPIs of selected */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              { label: "Pontos", value: selPts.toFixed(0), icon: Sparkles, color: "text-rose-500" },
              { label: "Projetos", value: selProjetos, icon: Folder, color: "text-amber-500" },
              { label: "Alterações", value: selAlteracoes, icon: RefreshCw, color: "text-blue-500" },
              { label: "Produtores", value: selProdutores, icon: Users, color: "text-violet-500" },
              { label: "Meta do Dia", value: `${selPct}%`, icon: Target, color: "text-pink-500" },
            ].map((k) => {
              const Icon = k.icon;
              return (
                <div key={k.label} className="p-4 rounded-xl border border-border/40 bg-muted/30 text-center">
                  <Icon className={`w-5 h-5 mx-auto ${k.color}`} />
                  <div className={`text-3xl font-extrabold mt-1 ${k.color}`}>{k.value}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{k.label}</div>
                </div>
              );
            })}
          </div>

          {/* Ranking + categories of selected */}
          <div className="grid lg:grid-cols-3 gap-3">
            <Card className="lg:col-span-2 border-border/40 bg-muted/20">
              <CardContent className="p-4">
                <div className="text-sm font-bold mb-3 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-500" /> Ranking do Dia
                </div>
                {selRanking.length === 0 ? (
                  <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem dados</div>
                ) : (
                  <div className="h-[260px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={selRanking} layout="vertical" margin={{ left: 30 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.3)" />
                        <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                        <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={90} />
                        <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                        <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 6, 6, 0]}>
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
            <Card className="border-border/40 bg-muted/20">
              <CardContent className="p-4">
                <div className="text-sm font-bold mb-3 flex items-center gap-1.5">
                  <Folder className="w-4 h-4 text-amber-500" /> Categorias
                </div>
                {selCategories.length === 0 ? (
                  <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">Sem categorias</div>
                ) : (
                  <div className="space-y-2">
                    {selCategories.map((c, i) => (
                      <div key={c.name} className="flex items-center justify-between p-2.5 rounded-lg bg-background/60 border border-border/30">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-[10px] font-bold text-muted-foreground">#{i + 1}</span>
                          <span className="text-sm font-bold truncate">{c.name}</span>
                        </div>
                        <span className="text-sm font-bold">{c.count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* ============= METAS POR PRODUTOR ============= */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold mb-3 flex items-center gap-1.5">
            <Target className="w-3 h-3 text-primary" /> Meta diária por produtor
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(producers.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-muted/20">
                <Avatar className="w-9 h-9"><AvatarImage src={p.avatar_url} /><AvatarFallback>{initials(p.name)}</AvatarFallback></Avatar>
                <div className="flex-1 truncate text-sm font-medium">{p.name}</div>
                <Input
                  type="number" step="0.5" min="0"
                  defaultValue={p.daily_points_goal ?? 7}
                  onBlur={(e) => { if (Number(e.target.value) !== Number(p.daily_points_goal)) updateGoal(p.id, e.target.value); }}
                  className="h-8 w-20 text-center"
                />
                <span className="text-[10px] text-muted-foreground">pts</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}