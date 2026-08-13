import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Target,
  Trophy,
  Folder,
  RefreshCw,
  Users,
  Sparkles,
  Crown,
  Flame,
  TrendingUp,
  Calendar,
  FileText,
  BarChart3,
  PartyPopper,
  LineChart as LineIcon,
  Award,
  Copy,
  Printer,
  Zap,
  Star,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import { useTheme } from "@/hooks/use-theme";
import { useMidnightRefresh } from "@/hooks/use-midnight-refresh";
import { fmtDateTime } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
  LineChart,
  Line,
  Area,
  AreaChart,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export const ymd = (d: Date) => {
  const y = d.getFullYear(),
    m = String(d.getMonth() + 1).padStart(2, "0"),
    dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};
export const today = () => ymd(new Date());
export const yesterday = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return ymd(d);
};
export const monthStart = (offset = 0) => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return ymd(d);
};
export const monthEnd = (offset = 0) => {
  const d = new Date();
  d.setMonth(d.getMonth() + offset + 1);
  d.setDate(0);
  return ymd(d);
};
export const fmtBR = (iso: string) => {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
};
export const monthLabel = (iso: string) => {
  const [y, m] = iso.split("-");
  const names = [
    "JAN",
    "FEV",
    "MAR",
    "ABR",
    "MAI",
    "JUN",
    "JUL",
    "AGO",
    "SET",
    "OUT",
    "NOV",
    "DEZ",
  ];
  return `${names[Number(m) - 1]}-${y}`;
};
export const initials = (n?: string) =>
  (n ?? "?")
    .split(/\s+/)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function workdaysInMonth(
  workdays: number[] = [1, 2, 3, 4, 5],
  holidays: string[] = [],
  offset = 0,
): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const last = new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month, day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (workdays.includes(d.getDay()) && !holidays.includes(iso)) count++;
  }
  return count;
}

export function isWorkingDay(
  iso: string,
  workdays: number[] = [1, 2, 3, 4, 5],
  holidays: string[] = [],
): boolean {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return workdays.includes(dt.getDay()) && !holidays.includes(iso);
}

// Conta quantos dias úteis já passaram no mês corrente (até hoje, inclusive).
export function workingDaysElapsed(
  workdays: number[] = [1, 2, 3, 4, 5],
  holidays: string[] = [],
  offset = 0,
): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + offset;
  const last = offset === 0 ? now.getDate() : new Date(year, month + 1, 0).getDate();
  let count = 0;
  for (let day = 1; day <= last; day++) {
    const d = new Date(year, month, day);
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    if (workdays.includes(d.getDay()) && !holidays.includes(iso)) count++;
  }
  return Math.max(1, count);
}

// Extrai duração (em segundos) do título do card. Aceita "2:30", "1:02:30", "150s", "2min", "2min30s".
export function parseDuracaoSegundos(name: string): number {
  if (!name) return 0;
  const s = String(name).toLowerCase();
  const mColon = s.match(/(?<![\d:])(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?(?![\d:])/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }
  const mUnits = s.match(/(\d+)\s*(?:min|m)\b(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);
  const mSec = s.match(/(\d+)\s*s\b/);
  if (mSec) return Number(mSec[1]);
  return 0;
}

export { formatDuracao } from "@/lib/format";
import { formatDuracao } from "@/lib/format";

export function useOmData() {
  const qc = useQueryClient();
  // Auto-refresh à meia-noite — zera KPIs do "Hoje" sem reload
  useMidnightRefresh();
  const producers = useQuery({
    queryKey: ["om-producers"],
    queryFn: async () =>
      (await supabase.from("producers").select("id,name,daily_points_goal,active,avatar_url"))
        .data ?? [],
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });
  const settings = useQuery({
    queryKey: ["om-settings"],
    queryFn: async () =>
      (
        await (supabase as any)
          .from("om_settings")
          .select("id,base_daily_goal,workdays,holidays,created_at,updated_at")
          .eq("id", true)
          .maybeSingle()
      ).data ?? { base_daily_goal: 6, workdays: [1, 2, 3, 4, 5], holidays: [] },
  });
  const orders = useQuery({
    queryKey: ["om-orders"],
    queryFn: async () =>
      (
        await supabase
          .from("service_orders")
          .select(
            "id,title,producer_id,sale_id,column_id,delivered_at,updated_at,redo_count,last_redo_at,video_duration_seconds,kanban_columns(name,is_done,is_default),sales(producer_id,service_type_id,package_id,video_duration_seconds,service_types(name,points,points_value),packages(name,points_value))",
          )
      ).data?.map((o: any) => ({
        ...o,
        // Fallback: se a ordem não tem producer_id atribuído, usa o da venda.
        producer_id: o.producer_id ?? o.sales?.producer_id ?? null,
      })) ?? [],
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  // Realtime: refletir imediatamente novos/desativados produtores e movimentações de cards
  useEffect(() => {
    const ch = supabase
      .channel("om-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "producers" }, () =>
        qc.invalidateQueries({ queryKey: ["om-producers"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () =>
        qc.invalidateQueries({ queryKey: ["om-orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const computePts = (o: any) => {
    const sale: any = o.sales || {};
    const base = Number(
      sale.service_types?.points ??
        sale.service_types?.points_value ??
        sale.packages?.points_value ??
        1,
    );
    // Prefere a minutagem específica do card; cai pra venda quando não houver.
    const dur = Number(o.video_duration_seconds ?? sale.video_duration_seconds ?? 0);
    // Vídeo: cada 30s = 1 ponto (30s=1, 60s=2, 90s=3, 120s=4...).
    // Sem duração (serviço que não é vídeo): usa a pontuação base do serviço.
    if (dur > 0) return Math.ceil(dur / 30);
    return base;
  };
  const catName = (o: any) => {
    const s: any = o.sales || {};
    return s.packages?.name ?? s.service_types?.name ?? "Outro";
  };
  const activeProducerIds = new Set(
    (producers.data ?? []).filter((p: any) => p.active !== false).map((p: any) => p.id),
  );
  const delivered = (orders.data ?? [])
    .filter((o: any) => !!o.delivered_at)
    // só conta entregas de produtores ativos (desativados somem automaticamente)
    .filter((o: any) => !o.producer_id || activeProducerIds.has(o.producer_id));

  // Estado atual no Kanban (independente de período): tudo que está hoje em colunas concluídas / em produção.
  const allOrders = (orders.data ?? []).filter(
    (o: any) => !o.producer_id || activeProducerIds.has(o.producer_id),
  );
  // "Em produção" reflete o Kanban real: exclui a coluna "A fazer" (is_default) e as colunas concluídas (is_done)
  const inProductionNow = allOrders.filter(
    (o: any) =>
      o.kanban_columns &&
      o.kanban_columns.is_done === false &&
      o.kanban_columns.is_default !== true,
  );
  const doneNow = allOrders.filter((o: any) => o.kanban_columns?.is_done === true);

  const sumPts = (arr: any[]) => arr.reduce((a, o) => a + computePts(o), 0);
  // Prioridade: minutagem do card → minutagem da venda → parse do título (legado).
  const sumDuracao = (arr: any[]) =>
    arr.reduce(
      (a, o) =>
        a +
        (Number(o.video_duration_seconds) ||
          Number(o.sales?.video_duration_seconds) ||
          parseDuracaoSegundos(o.title ?? "")),
      0,
    );
  const prodOf = (id: string) => (producers.data ?? []).find((p: any) => p.id === id) as any;
  const s = settings.data ?? { base_daily_goal: 6, workdays: [1, 2, 3, 4, 5], holidays: [] };
  return {
    qc,
    producers: (producers.data ?? []).filter((p: any) => p.active !== false),
    delivered,
    allOrders,
    inProductionNow,
    doneNow,
    computePts,
    catName,
    sumPts,
    sumDuracao,
    prodOf,
    baseGoal: Number(s.base_daily_goal ?? 6),
    workdays: (s.workdays ?? [1, 2, 3, 4, 5]) as number[],
    holidays: (s.holidays ?? []) as string[],
  };
}

/* ============================ ANÁLISE DIÁRIA ============================ */
export function DiariaView({
  delivered,
  producers,
  computePts,
  catName,
  sumPts,
  baseGoal = 6,
  workdays = [1, 2, 3, 4, 5],
  holidays = [],
}: any) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ringBg = (pctReached: boolean) =>
    pctReached
      ? isDark
        ? "rgba(16,185,129,0.3)"
        : "rgba(16,185,129,0.2)"
      : isDark
        ? "#ef4444"
        : "#0a0a0a";
  const t = today(),
    y = yesterday(),
    ms = monthStart();
  const onDate = (iso: string) =>
    delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) === iso);
  const todayOrders = onDate(t);
  const yOrders = onDate(y);
  const monthOrders = delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) >= ms);

  const todayPts = sumPts(todayOrders);
  const yPts = sumPts(yOrders);
  const monthPts = sumPts(monthOrders);

  const todayIsWorking = isWorkingDay(t, workdays, holidays);
  const totalGoalToday = todayIsWorking
    ? producers
        .filter((p: any) => p.active !== false)
        .reduce((a: number, p: any) => a + Number(p.daily_points_goal ?? baseGoal), 0)
    : 0;
  const pct = totalGoalToday > 0 ? Math.min(100, Math.round((todayPts / totalGoalToday) * 100)) : 0;
  const diffYesterday = todayPts - yPts;

  const status =
    pct >= 100
      ? { title: "Meta batida!", emoji: "🏆", color: "#10b981" }
      : pct >= 70
        ? { title: "Quase lá!", emoji: "🔥", color: "#f59e0b" }
        : pct >= 30
          ? { title: "No ritmo!", emoji: "🚀", color: "#3b82f6" }
          : { title: "Vamos lá!", emoji: "🚀", color: "#ef4444" };

  const todayRanking = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => {
        const prod = producers.find((x: any) => x.id === pid);
        return {
          name: prod?.name ?? "—",
          avatar: prod?.avatar_url ?? null,
          points: Number(p.toFixed(1)),
        };
      })
      .sort((a, b) => b.points - a.points);
  }, [todayOrders, producers]);

  const todayCategories = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) m.set(catName(o), (m.get(catName(o)) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([n, c]) => ({ name: n, count: c }))
      .sort((a, b) => b.count - a.count);
  }, [todayOrders]);

  const projetosTotal = todayOrders.length;
  const produtoresAtivos = producers.filter((p: any) => p.active !== false).length;

  return (
    <div className="space-y-4">
      <Card
        className="border-border/50 overflow-hidden"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <CardContent className="p-6">
          <SectionLabel icon={Target}>Meta do Dia</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-stretch mt-4">
            <div className="flex flex-col gap-3 w-full h-full justify-center">
              <MiniStat
                icon={TrendingUp}
                label="vs Ontem"
                value={`${diffYesterday >= 0 ? "+" : ""}${diffYesterday.toFixed(0)}`}
                valueClass={diffYesterday >= 0 ? "text-emerald-500" : "text-red-500"}
                size="lg"
              />
              <MiniStat
                icon={Calendar}
                label="Ontem"
                value={yPts > 0 ? yPts.toFixed(0) : "--"}
                suffix="pts"
                size="lg"
              />
            </div>
            <div className="relative h-[340px] md:h-[400px] w-full md:w-[400px] flex items-center justify-center col-span-2 md:col-span-1 order-first md:order-none mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="76%"
                  outerRadius="100%"
                  data={[{ name: "pct", value: pct, fill: "#10b981" }]}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={30}
                    background={{ fill: ringBg(pct >= 100) }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="text-7xl md:text-8xl font-extrabold tracking-tight"
                  style={{ color: "#10b981" }}
                >
                  {pct}%
                </div>
                <div className="text-sm md:text-base text-muted-foreground mt-2 font-medium">
                  {todayPts.toFixed(0)} / {totalGoalToday} pts
                </div>
                <div className="text-xs text-muted-foreground/80">
                  ≡ {todayPts.toFixed(0)} vídeos
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full h-full justify-center">
              <div className="p-5 rounded-xl bg-muted/40 border border-border/40 flex-1 flex flex-col justify-center">
                <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">
                  Status
                </div>
                <div className="text-3xl mt-2">{status.emoji}</div>
                <div className="text-lg font-bold leading-tight mt-1">{status.title}</div>
              </div>
              <MiniStat
                icon={Sparkles}
                label="Pontos do Mês"
                value={monthPts.toFixed(0)}
                size="lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <SectionLabel icon={Folder} iconClass="text-amber-500">
              Projetos (hoje)
            </SectionLabel>
            <div className="text-5xl font-extrabold mt-2">{projetosTotal}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              {produtoresAtivos} produtores ativos
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5 flex flex-col items-center justify-center text-center h-full">
            <SectionLabel icon={Sparkles} iconClass="text-rose-500">
              Pontos (hoje)
            </SectionLabel>
            <div className="text-5xl font-extrabold mt-2">{todayPts.toFixed(0)}</div>
            <div className="text-[11px] text-muted-foreground mt-1">
              ≡ {todayPts.toFixed(0)} vídeos (30s = 1 vídeo)
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card
          className="lg:col-span-2 border-border/50"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <CardContent className="p-5">
            <SectionLabel icon={Trophy} iconClass="text-amber-500">
              Ranking do Dia
            </SectionLabel>
            {todayRanking.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Sem dados ainda
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {todayRanking.map((r, i) => {
                  const max = todayRanking[0]?.points || 1;
                  const pctBar = Math.max(4, Math.round((r.points / max) * 100));
                  const initials = r.name
                    .split(/\s+/)
                    .map((n: string) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase();
                  return (
                    <div key={i} className="flex items-center gap-3">
                      <div className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">
                        #{i + 1}
                      </div>
                      {r.avatar ? (
                        <img
                          src={r.avatar}
                          alt={r.name}
                          className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-border"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 ring-2 ring-border">
                          {initials}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium truncate">{r.name}</span>
                          <span className="text-sm font-bold tabular-nums shrink-0">
                            {r.points}
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pctBar}%`,
                              background: "var(--ranking-bar, var(--primary))",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <SectionLabel icon={Zap} iconClass="text-pink-500">
              Categorias do Dia
            </SectionLabel>
            {todayCategories.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Sem categorias
              </div>
            ) : (
              <div className="space-y-2 mt-3">
                {todayCategories.slice(0, 8).map((c: any, i: number) => (
                  <div
                    key={c.name}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/30"
                  >
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
      </div>
    </div>
  );
}

/* ============================ ANÁLISE MENSAL ============================ */
export function MensalView({ delivered, producers, computePts, catName, sumPts, prodOf }: any) {
  const curStart = monthStart(0),
    curEnd = monthEnd(0);
  const prevStart = monthStart(-1),
    prevEnd = monthEnd(-1);

  const inRange = (a: string, b: string) =>
    delivered.filter((o: any) => {
      const d = String(o.delivered_at).slice(0, 10);
      return d >= a && d <= b;
    });

  const cur = inRange(curStart, curEnd);
  const prev = inRange(prevStart, prevEnd);

  const curPts = sumPts(cur),
    prevPts = sumPts(prev);
  const curProjetos = cur.length,
    prevProjetos = prev.length;
  const curAlt = cur.reduce((a: number, o: any) => a + Number(o.redo_count ?? 0), 0);
  const prevAlt = prev.reduce((a: number, o: any) => a + Number(o.redo_count ?? 0), 0);
  const curProds = new Set(cur.map((o: any) => o.producer_id).filter(Boolean)).size;
  const prevProds = new Set(prev.map((o: any) => o.producer_id).filter(Boolean)).size;
  const curApprov = curProjetos > 0 ? Math.round(((curProjetos - curAlt) / curProjetos) * 100) : 0;
  const prevApprov =
    prevProjetos > 0 ? Math.round(((prevProjetos - prevAlt) / prevProjetos) * 100) : 0;

  const ranking = (arr: any[]) => {
    const m = new Map<
      string,
      { name: string; points: number; projetos: number; avatar_url?: string }
    >();
    for (const o of arr) {
      if (!o.producer_id) continue;
      const prod = prodOf(o.producer_id);
      const cur = m.get(o.producer_id) ?? {
        name: prod?.name ?? "—",
        points: 0,
        projetos: 0,
        avatar_url: prod?.avatar_url,
      };
      cur.points += computePts(o);
      cur.projetos += 1;
      m.set(o.producer_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.points - a.points);
  };
  const rPts = ranking(cur);
  const topByProj = [...rPts].sort((a, b) => b.projetos - a.projetos);

  const altPerProducer = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of cur) {
      if (!o.producer_id) continue;
      const r = Number(o.redo_count ?? 0);
      if (r > 0) m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + r);
    }
    return Array.from(m.entries())
      .map(([pid, c]) => ({
        name: (prodOf(pid)?.name ?? "—").toUpperCase(),
        avatar_url: prodOf(pid)?.avatar_url,
        value: c,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [cur]);

  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of cur) m.set(catName(o), (m.get(catName(o)) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([n, c]) => ({ name: n, value: c }))
      .sort((a, b) => b.value - a.value);
  }, [cur]);

  const PIE_COLORS = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

  const rei = rPts[0];
  const maisProj = topByProj[0];
  const reBest = altPerProducer[0];
  const finalizador = useMemo(() => {
    const lastDay = cur.reduce((acc: string, o: any) => {
      const d = String(o.delivered_at).slice(0, 10);
      return d > acc ? d : acc;
    }, "");
    if (!lastDay) return null;
    const m = new Map<string, number>();
    for (const o of cur) {
      if (String(o.delivered_at).slice(0, 10) === lastDay && o.producer_id) {
        m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + 1);
      }
    }
    let best: any = null;
    for (const [pid, c] of m.entries()) if (!best || c > best.count) best = { pid, count: c };
    if (!best) return null;
    return {
      name: prodOf(best.pid)?.name ?? "—",
      avatar_url: prodOf(best.pid)?.avatar_url,
      count: best.count,
      day: lastDay,
    };
  }, [cur]);

  const dif = (a: number, b: number) =>
    b === 0 ? "—" : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-rose-500" /> Análise Mensal
        </h2>
        <span className="px-2 py-0.5 text-[10px] rounded bg-muted text-muted-foreground font-bold">
          {monthLabel(curStart)}
        </span>
        <span className="px-2 py-0.5 text-[10px] rounded bg-rose-500/15 text-rose-500 font-bold">
          vs {monthLabel(prevStart)}
        </span>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <SectionLabel icon={Star} iconClass="text-amber-500">
            Destaques do Mês
          </SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            <HighlightCard
              title="Rei do Mês"
              icon={Crown}
              producer={rei}
              valueLabel={rei ? `${Math.round(rei.points)} pts` : "—"}
            />
            <HighlightCard
              title="Mais Projetos"
              icon={Folder}
              producer={maisProj}
              valueLabel={maisProj ? `${maisProj.projetos} proj` : "—"}
            />
            <HighlightCard
              title="Refeitor"
              icon={RefreshCw}
              producer={reBest ? { name: reBest.name, avatar_url: reBest.avatar_url } : null}
              valueLabel={reBest ? `${reBest.value} alterações` : "—"}
            />
            <HighlightCard
              title="Finalizador"
              icon={Flame}
              producer={
                finalizador ? { name: finalizador.name, avatar_url: finalizador.avatar_url } : null
              }
              valueLabel={finalizador ? `${finalizador.count} proj em 1 dia` : "—"}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigKpi label="Total de Pontos" value={curPts.toFixed(0)} accent="text-rose-500" />
        <BigKpi label="Total de Projetos" value={String(curProjetos)} />
        <BigKpi label="Total de Alterações" value={String(curAlt)} />
        <BigKpi label="Produtores Ativos" value={String(curProds)} />
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <SectionLabel icon={RefreshCw} iconClass="text-blue-500">
            Comparativo Mensal
          </SectionLabel>
          <div className="grid md:grid-cols-[1fr_auto_1fr] gap-4 items-center mt-3">
            <CompCol
              title={monthLabel(prevStart)}
              pts={prevPts}
              projetos={prevProjetos}
              alteracoes={prevAlt}
              produtores={prevProds}
              approv={prevApprov}
              side="left"
            />
            <div className="text-center text-xs font-bold text-muted-foreground">VS</div>
            <CompCol
              title={monthLabel(curStart)}
              pts={curPts}
              projetos={curProjetos}
              alteracoes={curAlt}
              produtores={curProds}
              approv={curApprov}
              side="right"
              diff={{ pts: dif(curPts, prevPts), proj: dif(curProjetos, prevProjetos) }}
            />
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <SectionLabel icon={Trophy} iconClass="text-rose-500">
              Ranking de Pontos
            </SectionLabel>
            <div className="h-[300px] mt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={rPts
                    .slice(0, 8)
                    .map((r) => ({ name: r.name.toUpperCase(), value: Math.round(r.points) }))}
                  layout="vertical"
                  margin={{ left: 20 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
                  />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} />
                  <YAxis
                    dataKey="name"
                    type="category"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    width={80}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--card)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                    }}
                  />
                  <Bar dataKey="value" fill="#ef4444" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <SectionLabel icon={Folder} iconClass="text-amber-500">
              Projetos por Categoria
            </SectionLabel>
            {cats.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                Sem categorias
              </div>
            ) : (
              <div className="h-[300px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cats}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={60}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {cats.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <SectionLabel icon={RefreshCw} iconClass="text-orange-500">
              Alterações por Produtor
            </SectionLabel>
            {altPerProducer.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
                Sem alterações
              </div>
            ) : (
              <div className="h-[300px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={altPerProducer}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
                    />
                    <XAxis
                      dataKey="name"
                      stroke="var(--muted-foreground)"
                      fontSize={10}
                      angle={-30}
                      textAnchor="end"
                      height={60}
                    />
                    <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Bar dataKey="value" fill="#f97316" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================ DINÂMICA ============================ */
export function DinamicaView({
  delivered,
  producers,
  computePts,
  sumPts,
  prodOf,
  baseGoal = 6,
  workdays = [1, 2, 3, 4, 5],
  holidays = [],
}: any) {
  const ms = monthStart(0),
    me = monthEnd(0);
  const monthOrders = delivered.filter((o: any) => {
    const d = String(o.delivered_at).slice(0, 10);
    return d >= ms && d <= me;
  });
  const monthPts = sumPts(monthOrders);

  const totalGoalDay = producers
    .filter((p: any) => p.active !== false)
    .reduce((a: number, p: any) => a + Number(p.daily_points_goal ?? baseGoal), 0);
  const workDays = workdaysInMonth(workdays, holidays, 0);
  const monthGoal = totalGoalDay * workDays;
  const pct = monthGoal > 0 ? Math.min(100, Math.round((monthPts / monthGoal) * 100)) : 0;

  const sevenAgo = new Date();
  sevenAgo.setDate(sevenAgo.getDate() - 7);
  const weekOrders = delivered.filter((o: any) => new Date(o.delivered_at) >= sevenAgo);
  const weekRanking = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of weekOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => ({
        name: prodOf(pid)?.name ?? "—",
        avatar_url: prodOf(pid)?.avatar_url,
        points: Math.round(p),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 3);
  }, [weekOrders, producers]);

  const todayOrders = delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) === today());
  const topToday = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return Array.from(m.entries())
      .map(([pid, p]) => ({
        name: prodOf(pid)?.name ?? "—",
        avatar_url: prodOf(pid)?.avatar_url,
        points: Math.round(p),
      }))
      .sort((a, b) => b.points - a.points)
      .slice(0, 2);
  }, [todayOrders, producers]);

  const todayByProducer = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return producers
      .filter((p: any) => p.active !== false)
      .map((p: any) => {
        const pts = m.get(p.id) ?? 0;
        const goal = Number(p.daily_points_goal ?? baseGoal);
        return {
          name: p.name,
          avatar_url: p.avatar_url,
          pts: Math.round(pts),
          goal,
          ok: pts >= goal,
        };
      })
      .filter((x: any) => x.ok);
  }, [todayOrders, producers]);

  const projetos = monthOrders.length;
  const alteracoes = monthOrders.reduce((a: number, o: any) => a + Number(o.redo_count ?? 0), 0);
  const produtores = new Set(monthOrders.map((o: any) => o.producer_id).filter(Boolean)).size;

  return (
    <div className="space-y-4">
      <Card
        className="border-violet-500/30 overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(270 70% 30% / 0.4), hsl(280 70% 25% / 0.2))",
        }}
      >
        <CardContent className="p-5 flex items-center gap-3">
          <div className="w-12 h-12 rounded-full bg-violet-500/30 flex items-center justify-center text-2xl">
            🎯
          </div>
          <div>
            <h2 className="text-xl font-bold">Meta Coletiva da Equipe</h2>
            <p className="text-xs text-muted-foreground">
              Acompanhe o progresso da meta coletiva e as recompensas da equipe
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-bold flex items-center gap-2">
                <Target className="w-4 h-4 text-rose-500" /> Meta Coletiva da Equipe
              </div>
              <div className="text-xs text-muted-foreground">
                Recompensas baseadas no desempenho coletivo
              </div>
            </div>
            {pct >= 70 && (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-bold">
                ✓ Recompensas
              </span>
            )}
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold">
              <span className="text-rose-500">{Math.round(monthPts)}</span>{" "}
              <span className="text-base text-muted-foreground">/ {monthGoal} pontos</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pct}%`,
                  background: "linear-gradient(90deg,#ef4444,#f59e0b,#fde047)",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0%</span>
              <span>70%</span>
              <span>80%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <RewardChip pct={70} label="R$ 5.000,00" active={pct >= 70} />
            <RewardChip pct={80} label="R$ 7.500,00" active={pct >= 80} />
            <RewardChip pct={100} label="R$ 10.000,00" active={pct >= 100} highlight />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            <MetricBlock value={produtores} label="produtores" emoji="👥" />
            <MetricBlock
              value={Math.round((monthPts / Math.max(1, produtores)) * 10) / 10}
              label="pontos/equipe"
              emoji="⚡"
            />
            <MetricBlock value={alteracoes} label="alterações" emoji="🔄" />
            <MetricBlock value={projetos} label="dias produtivos" emoji="📅" />
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-3">
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="font-bold flex items-center gap-2 mb-1">🏆 Melhor da Semana</div>
            <div className="text-xs text-muted-foreground mb-3">
              Maior pontuação acumulada na semana (Seg–Sex). Anuncia o sábado.
            </div>
            {weekRanking.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Ainda sem pontuações na semana.
              </div>
            ) : (
              <div className="space-y-2">
                {weekRanking.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                      <Avatar className="w-11 h-11 ring-2 ring-primary/30">
                        <AvatarImage src={p.avatar_url} />
                        <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-sm">{p.name}</span>
                    </div>
                    <span className="font-bold text-sm">
                      {p.points} <span className="text-[10px] text-muted-foreground">pts</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <div className="font-bold flex items-center gap-2 mb-1">🥇 Top 2 do Dia</div>
            <div className="text-xs text-muted-foreground mb-3">
              Os 2 maiores pontuadores de hoje.
            </div>
            {topToday.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Sem pontuações hoje ainda.
              </div>
            ) : (
              <div className="space-y-2">
                {topToday.map((p, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/30"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{i === 0 ? "🥇" : "🥈"}</span>
                      <Avatar className="w-11 h-11 ring-2 ring-primary/30">
                        <AvatarImage src={p.avatar_url} />
                        <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                      </Avatar>
                      <span className="font-bold text-sm">{p.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm">
                        {p.points} <span className="text-[10px] text-muted-foreground">pts</span>
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        é equivalente a {p.points} {p.points === 1 ? "vídeo" : "vídeos"}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="font-bold flex items-center gap-2 mb-1">✅ Meta Diária Batida</div>
          <div className="text-xs text-muted-foreground mb-3">
            Produtores que atingiram ou superaram a meta de hoje.
          </div>
          {todayByProducer.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              Ninguém bateu a meta hoje ainda.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {todayByProducer.map((p: any) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-11 h-11 ring-2 ring-primary/30">
                      <AvatarImage src={p.avatar_url} />
                      <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-sm">{p.name}</span>
                  </div>
                  <span className="text-emerald-500 font-bold">
                    {p.pts}/{p.goal}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================ TENDÊNCIAS ============================ */
export function TendenciasView({
  delivered,
  sumPts,
  workdays = [1, 2, 3, 4, 5],
  holidays = [],
}: any) {
  const days: { iso: string; label: string }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push({ iso: ymd(d), label: fmtBR(ymd(d)) });
  }
  const byDay = (iso: string) =>
    delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) === iso);

  const ptsSeries = days.map((d) => ({ name: d.label, value: Math.round(sumPts(byDay(d.iso))) }));
  const projAltSeries = days.map((d) => {
    const list = byDay(d.iso);
    return {
      name: d.label,
      projetos: list.length,
      alteracoes: list.reduce((a: number, o: any) => a + Number(o.redo_count ?? 0), 0),
    };
  });
  const activeProdsSeries = days.map((d) => ({
    name: d.label,
    value: new Set(
      byDay(d.iso)
        .map((o: any) => o.producer_id)
        .filter(Boolean),
    ).size,
  }));
  const avgPerProducer = days.map((d) => {
    const list = byDay(d.iso);
    const total = sumPts(list);
    const n = new Set(list.map((o: any) => o.producer_id).filter(Boolean)).size;
    return { name: d.label, value: n > 0 ? Math.round((total / n) * 10) / 10 : 0 };
  });

  const last7Pts = ptsSeries.slice(-7).reduce((a, x) => a + x.value, 0);
  const prev7Pts = ptsSeries.slice(-14, -7).reduce((a, x) => a + x.value, 0);
  const last7Proj = projAltSeries.slice(-7).reduce((a, x) => a + x.projetos, 0);
  const prev7Proj = projAltSeries.slice(-14, -7).reduce((a, x) => a + x.projetos, 0);
  const last7Eff = last7Proj > 0 ? Math.round((last7Pts / last7Proj) * 10) / 10 : 0;
  const prev7Eff = prev7Proj > 0 ? Math.round((prev7Pts / prev7Proj) * 10) / 10 : 0;
  const diff = (a: number, b: number) =>
    b === 0 ? "0%" : `${a >= b ? "+" : ""}${Math.round(((a - b) / b) * 100)}%`;

  // Projeção do mês usando DIAS ÚTEIS (não calendário) — não dilui o ritmo com fins de semana e feriados.
  const workDaysTotal = workdaysInMonth(workdays, holidays, 0);
  const workDaysSoFar = workingDaysElapsed(workdays, holidays, 0);
  const ms = monthStart(0);
  const monthPts = sumPts(delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) >= ms));
  const projection = workDaysSoFar > 0 ? Math.round((monthPts / workDaysSoFar) * workDaysTotal) : 0;
  const workDaysRemaining = Math.max(0, workDaysTotal - workDaysSoFar);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <TrendKpi
          label="Pontos vs Semana Anterior"
          value={diff(last7Pts, prev7Pts)}
          sub={`${last7Pts} vs ${prev7Pts}`}
          positive={last7Pts >= prev7Pts}
        />
        <TrendKpi
          label="Projetos vs Semana Anterior"
          value={diff(last7Proj, prev7Proj)}
          sub={`${last7Proj} vs ${prev7Proj}`}
          positive={last7Proj >= prev7Proj}
        />
        <TrendKpi
          label="Eficiência vs Semana Anterior"
          value={diff(last7Eff, prev7Eff)}
          sub={`${last7Eff} vs ${prev7Eff}`}
          positive={last7Eff >= prev7Eff}
        />
        <TrendKpi
          label="Projeção do Mês"
          value={`${projection} pts`}
          sub={`${workDaysRemaining} dias úteis restantes`}
          positive
          accent="text-emerald-500"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-3">
        <ChartCard title="Evolução Diária de Pontos" icon={LineIcon} accent="text-rose-500">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={ptsSeries}>
              <defs>
                <linearGradient id="gPts" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#ef4444" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
              />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={3} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#ef4444" fill="url(#gPts)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Produtores Ativos por Dia" icon={Users} accent="text-blue-500">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={activeProdsSeries}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
              />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={3} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Projetos vs Alterações" icon={RefreshCw} accent="text-amber-500">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={projAltSeries}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
              />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={3} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line
                type="monotone"
                dataKey="projetos"
                stroke="#10b981"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="alteracoes"
                stroke="#f59e0b"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Média de Pontos por Produtor" icon={Zap} accent="text-violet-500">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={avgPerProducer}>
              <defs>
                <linearGradient id="gAvg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.6} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="color-mix(in oklab, var(--border) calc(0.3 * 100%), transparent)"
              />
              <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={10} interval={3} />
              <YAxis stroke="var(--muted-foreground)" fontSize={10} />
              <Tooltip
                contentStyle={{
                  background: "var(--card)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
              />
              <Area type="monotone" dataKey="value" stroke="#8b5cf6" fill="url(#gAvg)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

/* ============================ VISÃO GERAL ============================ */
export function VisaoGeralView({
  delivered,
  producers,
  inProductionNow,
  computePts,
  catName,
  sumPts,
  sumDuracao,
  prodOf,
  baseGoal = 6,
  workdays = [1, 2, 3, 4, 5],
  holidays = [],
}: any) {
  const { theme } = useTheme();
  const isDark = theme === "dark";
  const ringBg = (ok: boolean) =>
    ok
      ? isDark
        ? "rgba(16,185,129,0.3)"
        : "rgba(16,185,129,0.2)"
      : isDark
        ? "#ef4444"
        : "#0a0a0a";

  const t = today(),
    y = yesterday();
  const ms = monthStart(0),
    me = monthEnd(0);
  const onDate = (iso: string) =>
    delivered.filter((o: any) => String(o.delivered_at).slice(0, 10) === iso);
  const todayOrders = onDate(t);
  const yOrders = onDate(y);
  const monthOrders = delivered.filter((o: any) => {
    const d = String(o.delivered_at).slice(0, 10);
    return d >= ms && d <= me;
  });

  const todayPts = sumPts(todayOrders);
  const yPts = sumPts(yOrders);
  const monthPts = sumPts(monthOrders);
  const monthSec = sumDuracao(monthOrders);
  const todaySec = sumDuracao(todayOrders);
  const totalEmProducao = inProductionNow.length;

  // Meta diária (soma das metas individuais dos produtores ativos)
  const todayIsWorking = isWorkingDay(t, workdays, holidays);
  const totalGoalToday = todayIsWorking
    ? producers.reduce((a: number, p: any) => a + Number(p.daily_points_goal ?? baseGoal), 0)
    : 0;
  const pctDia =
    totalGoalToday > 0 ? Math.min(100, Math.round((todayPts / totalGoalToday) * 100)) : 0;

  // Meta mensal coletiva = soma metas diárias × dias úteis do mês
  const workDaysMonth = workdaysInMonth(workdays, holidays, 0);
  const totalGoalDay = producers.reduce(
    (a: number, p: any) => a + Number(p.daily_points_goal ?? baseGoal),
    0,
  );
  const monthGoal = totalGoalDay * workDaysMonth;
  const pctMes = monthGoal > 0 ? Math.min(100, Math.round((monthPts / monthGoal) * 100)) : 0;

  const diffYesterday = todayPts - yPts;

  const status =
    pctDia >= 100
      ? { title: "Meta batida!", emoji: "🏆", color: "#10b981" }
      : pctDia >= 70
        ? { title: "Quase lá!", emoji: "🔥", color: "#f59e0b" }
        : pctDia >= 30
          ? { title: "No ritmo!", emoji: "🚀", color: "#3b82f6" }
          : { title: "Vamos lá!", emoji: "🚀", color: "#ef4444" };

  // Ranking do mês
  const monthRanking = useMemo(() => {
    const m = new Map<string, { pts: number; videos: number; sec: number }>();
    for (const o of monthOrders) {
      if (!o.producer_id) continue;
      const cur = m.get(o.producer_id) ?? { pts: 0, videos: 0, sec: 0 };
      cur.pts += computePts(o);
      cur.videos += 1;
      cur.sec +=
        Number((o as any).video_duration_seconds) ||
        Number((o as any).sales?.video_duration_seconds) ||
        parseDuracaoSegundos(o.title ?? "");
      m.set(o.producer_id, cur);
    }
    return Array.from(m.entries())
      .map(([pid, v]) => {
        const prod = prodOf(pid);
        const dailyGoal = Number(prod?.daily_points_goal ?? baseGoal);
        const goal = dailyGoal * workingDaysElapsed(workdays, holidays, 0);
        return {
          id: pid,
          name: prod?.name ?? "—",
          avatar_url: prod?.avatar_url,
          pts: Math.round(v.pts),
          videos: v.videos,
          sec: v.sec,
          bateu: v.pts >= goal && goal > 0,
        };
      })
      .sort((a, b) => b.videos - a.videos || b.sec - a.sec)
      .slice(0, 10);
  }, [monthOrders, producers, baseGoal, workdays, holidays]);

  // Quem bateu a meta do dia
  const metaBatidaHoje = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of todayOrders) {
      if (!o.producer_id) continue;
      m.set(o.producer_id, (m.get(o.producer_id) ?? 0) + computePts(o));
    }
    return producers
      .map((p: any) => {
        const pts = m.get(p.id) ?? 0;
        const goal = Number(p.daily_points_goal ?? baseGoal);
        return {
          name: p.name,
          avatar_url: p.avatar_url,
          pts: Math.round(pts),
          goal,
          ok: pts >= goal,
        };
      })
      .filter((x: any) => x.ok);
  }, [todayOrders, producers, baseGoal]);

  // Categorias do mês
  const cats = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of monthOrders) m.set(catName(o), (m.get(catName(o)) ?? 0) + 1);
    return Array.from(m.entries())
      .map(([n, c]) => ({ name: n, value: c }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [monthOrders]);

  const PIE_COLORS = [
    "#ef4444",
    "#f59e0b",
    "#10b981",
    "#3b82f6",
    "#8b5cf6",
    "#ec4899",
    "#14b8a6",
    "#f97316",
  ];

  return (
    <div className="space-y-4">
      {/* Header KPIs do dia (produção diária — como no Dashboard de vendedores) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <BigKpi
          label={`Vídeos prontos — hoje (${fmtBR(t)})`}
          value={String(todayOrders.length)}
          accent="text-emerald-500"
        />
        <BigKpi label="Minutagem hoje" value={formatDuracao(todaySec)} accent="text-blue-500" />
        <BigKpi label="Em produção agora" value={String(totalEmProducao)} accent="text-amber-500" />
        <BigKpi label="Pontos hoje" value={String(Math.round(todayPts))} accent="text-rose-500" />
        <BigKpi
          label="Meta do dia"
          value={`${pctDia}%`}
          accent={pctDia >= 100 ? "text-emerald-500" : "text-rose-500"}
        />
      </div>

      {/* KPIs do mês (acumulado) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BigKpi
          label={`Vídeos prontos — ${monthLabel(ms)}`}
          value={String(monthOrders.length)}
          accent="text-emerald-500"
        />
        <BigKpi label="Minutagem do mês" value={formatDuracao(monthSec)} accent="text-blue-500" />
        <BigKpi label="Pontos do mês" value={String(Math.round(monthPts))} accent="text-rose-500" />
        <BigKpi
          label="Meta da equipe (mês)"
          value={`${pctMes}%`}
          accent={pctMes >= 100 ? "text-emerald-500" : "text-rose-500"}
        />
      </div>

      {/* Meta do dia */}
      <Card
        className="border-border/50 overflow-hidden"
        style={{ boxShadow: "var(--shadow-card)" }}
      >
        <CardContent className="p-6">
          <SectionLabel icon={Target}>Meta do Dia ({fmtBR(t)})</SectionLabel>
          <div className="grid grid-cols-2 md:grid-cols-[1fr_auto_1fr] gap-4 md:gap-6 items-stretch mt-4">
            <div className="flex flex-col gap-3 w-full h-full justify-center">
              <MiniStat
                icon={TrendingUp}
                label="vs Ontem"
                value={`${diffYesterday >= 0 ? "+" : ""}${diffYesterday.toFixed(0)}`}
                valueClass={diffYesterday >= 0 ? "text-emerald-500" : "text-red-500"}
                size="lg"
              />
              <MiniStat
                icon={Calendar}
                label="Ontem"
                value={yPts > 0 ? yPts.toFixed(0) : "--"}
                suffix="pts"
                size="lg"
              />
            </div>
            <div className="relative h-[300px] md:h-[360px] w-full md:w-[360px] flex items-center justify-center col-span-2 md:col-span-1 order-first md:order-none mx-auto">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart
                  innerRadius="76%"
                  outerRadius="100%"
                  data={[{ name: "pct", value: pctDia, fill: "#10b981" }]}
                  startAngle={90}
                  endAngle={-270}
                >
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar
                    dataKey="value"
                    cornerRadius={30}
                    background={{ fill: ringBg(pctDia >= 100) }}
                  />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <div
                  className="text-6xl md:text-7xl font-extrabold tracking-tight"
                  style={{ color: "#10b981" }}
                >
                  {pctDia}%
                </div>
                <div className="text-sm text-muted-foreground mt-2 font-medium">
                  {todayPts.toFixed(0)} / {totalGoalToday} pts
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-3 w-full h-full justify-center">
              <div className="p-5 rounded-xl bg-muted/40 border border-border/40 flex-1 flex flex-col justify-center">
                <div className="text-xs uppercase text-muted-foreground font-medium tracking-wide">
                  Status
                </div>
                <div className="text-3xl mt-2">{status.emoji}</div>
                <div className="text-lg font-bold leading-tight mt-1">{status.title}</div>
              </div>
              <MiniStat
                icon={Folder}
                label="Vídeos hoje"
                value={String(todayOrders.length)}
                size="lg"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Meta coletiva do mês */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <div className="font-bold flex items-center gap-2">
                <Target className="w-4 h-4 text-rose-500" /> Meta Coletiva — {monthLabel(ms)}
              </div>
              <div className="text-xs text-muted-foreground">
                Pontuação diária da equipe (
                <span className="font-semibold text-foreground">{totalGoalDay} pts/dia</span>) ×{" "}
                <span className="font-semibold text-foreground">{workDaysMonth} dias úteis</span> ={" "}
                <span className="font-semibold text-foreground">{monthGoal} pts no mês</span>
              </div>
            </div>
            {pctMes >= 70 && (
              <span className="px-3 py-1 rounded-full bg-emerald-500/15 text-emerald-500 text-xs font-bold">
                ✓ Recompensas ativadas
              </span>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {producers.map((p: any) => (
              <span
                key={p.id}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-muted/50 border border-border/40 text-[11px]"
                title={`${p.name} — ${Number(p.daily_points_goal ?? baseGoal)} pts/dia`}
              >
                <span className="font-medium">{p.name}</span>
                <span className="text-muted-foreground">
                  {Number(p.daily_points_goal ?? baseGoal)} pts/dia
                </span>
              </span>
            ))}
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold">
              <span className="text-rose-500">{Math.round(monthPts)}</span>{" "}
              <span className="text-base text-muted-foreground">/ {monthGoal} pontos</span>
            </div>
            <div className="mt-2 h-3 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full"
                style={{
                  width: `${pctMes}%`,
                  background: "linear-gradient(90deg,#ef4444,#f59e0b,#fde047)",
                }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
              <span>0%</span>
              <span>70%</span>
              <span>80%</span>
              <span>100%</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <RewardChip pct={70} label="R$ 5.000,00" active={pctMes >= 70} />
            <RewardChip pct={80} label="R$ 7.500,00" active={pctMes >= 80} />
            <RewardChip pct={100} label="R$ 10.000,00" active={pctMes >= 100} highlight />
          </div>
        </CardContent>
      </Card>

      {/* Quem bateu a meta hoje */}
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="font-bold flex items-center gap-2 mb-1">✅ Meta Diária Batida</div>
          <div className="text-xs text-muted-foreground mb-3">
            Produtores que atingiram ou superaram a meta de hoje.
          </div>
          {metaBatidaHoje.length === 0 ? (
            <div className="text-center py-6 text-sm text-muted-foreground">
              Ninguém bateu a meta hoje ainda.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
              {metaBatidaHoje.map((p: any) => (
                <div
                  key={p.name}
                  className="flex items-center justify-between p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30"
                >
                  <div className="flex items-center gap-2">
                    <Avatar className="w-10 h-10 ring-2 ring-emerald-500/40">
                      <AvatarImage src={p.avatar_url} />
                      <AvatarFallback className="text-xs">{initials(p.name)}</AvatarFallback>
                    </Avatar>
                    <span className="font-bold text-sm">{p.name}</span>
                  </div>
                  <span className="text-emerald-500 font-bold">
                    {p.pts}/{p.goal}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ranking do mês + Categorias */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Card
          className="lg:col-span-2 border-border/50"
          style={{ boxShadow: "var(--shadow-card)" }}
        >
          <CardContent className="p-5">
            <SectionLabel icon={Trophy} iconClass="text-amber-500">
              Ranking do Mês — {monthLabel(ms)}
            </SectionLabel>
            {monthRanking.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Sem entregas ainda este mês
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {monthRanking.map((r: any, i: number) => {
                  const max = monthRanking[0]?.videos || 1;
                  const pctBar = Math.max(4, Math.round((r.videos / max) * 100));
                  return (
                    <div key={r.id} className="flex items-center gap-3">
                      <div className="text-xs font-bold text-muted-foreground w-5 text-right shrink-0">
                        #{i + 1}
                      </div>
                      {r.avatar_url ? (
                        <img
                          src={r.avatar_url}
                          alt={r.name}
                          className={`w-9 h-9 rounded-full object-cover shrink-0 ring-2 ${r.bateu ? "ring-amber-400" : "ring-border"}`}
                        />
                      ) : (
                        <div
                          className={`w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 ring-2 ${r.bateu ? "ring-amber-400" : "ring-border"}`}
                        >
                          {initials(r.name)}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <span className="text-sm font-medium truncate flex items-center gap-1">
                            {r.name}
                            {r.bateu && (
                              <span className="text-[10px] text-amber-500 font-bold">🏆</span>
                            )}
                          </span>
                          <span className="text-xs tabular-nums shrink-0 text-muted-foreground">
                            <span className="font-bold text-foreground">{r.videos}</span> vídeos ·{" "}
                            {formatDuracao(r.sec)} · {r.pts} pts
                          </span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted/60 overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pctBar}%`,
                              background: r.bateu
                                ? "linear-gradient(90deg,#f59e0b,#fde047)"
                                : "var(--ranking-bar, var(--primary))",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-5">
            <SectionLabel icon={Folder} iconClass="text-amber-500">
              Categorias do Mês
            </SectionLabel>
            {cats.length === 0 ? (
              <div className="h-[260px] flex items-center justify-center text-sm text-muted-foreground">
                Sem categorias
              </div>
            ) : (
              <div className="h-[260px] mt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={cats}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {cats.map((_: any, i: number) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: "var(--card)",
                        border: "1px solid var(--border)",
                        borderRadius: 8,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ============================ PRODUTORES ============================ */
export function ProdutoresView({
  delivered,
  producers,
  inProductionNow,
  computePts,
  sumDuracao,
  baseGoal = 6,
  workdays = [1, 2, 3, 4, 5],
  holidays = [],
}: any) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"pontos" | "videos" | "minutagem" | "nome">("videos");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const ms = monthStart(0);
  const me = monthEnd(0);
  const workDaysElapsed = workingDaysElapsed(workdays, holidays, 0);
  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (local)

  const list = useMemo(() => {
    return producers
      .map((p: any) => {
        const all = delivered.filter((o: any) => o.producer_id === p.id);
        const monthOrders = all.filter((o: any) => {
          const d = String(o.delivered_at).slice(0, 10);
          return d >= ms && d <= me;
        });
        const pontos = monthOrders.reduce((a: number, o: any) => a + computePts(o), 0);
        const videos = monthOrders.length;
        const alteracoes = monthOrders.reduce(
          (a: number, o: any) => a + Number(o.redo_count ?? 0),
          0,
        );
        const segundos = sumDuracao(monthOrders);
        const totalEntregue = all.length;
        const segundosTotal = sumDuracao(all);
        const emProducao = inProductionNow.filter((o: any) => o.producer_id === p.id).length;
        const dailyGoal = Number(p.daily_points_goal ?? baseGoal);
        const monthGoal = dailyGoal * workDaysElapsed;
        const pctMeta = monthGoal > 0 ? Math.min(999, Math.round((pontos / monthGoal) * 100)) : 0;
        const bateu = pctMeta >= 100;
        return {
          ...p,
          pontos: Math.round(pontos),
          videos,
          totalEntregue,
          segundosTotal,
          alteracoes,
          segundos,
          emProducao,
          monthGoal,
          pctMeta,
          bateu,
          dailyGoal,
        };
      })
      .filter((p: any) => p.name?.toLowerCase().includes(search.toLowerCase()))
      .sort((a: any, b: any) => {
        if (sortBy === "nome") return String(a.name).localeCompare(String(b.name));
        if (sortBy === "videos") return b.videos - a.videos || b.segundos - a.segundos;
        if (sortBy === "minutagem") return b.segundos - a.segundos;
        return b.pontos - a.pontos;
      });
  }, [
    producers,
    delivered,
    inProductionNow,
    search,
    sortBy,
    ms,
    me,
    workDaysElapsed,
    baseGoal,
    sumDuracao,
    computePts,
  ]);

  const selected = list.find((p: any) => p.id === selectedId);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="🔍 Buscar produtor..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-md"
        />
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-muted-foreground">Ordenar por:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-background border border-border rounded-md px-2 py-1.5 text-sm"
          >
            <option value="videos">🎬 Vídeos prontos</option>
            <option value="minutagem">⏱ Minutagem</option>
            <option value="pontos">🏆 Pontos</option>
            <option value="nome">🔤 Nome</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {list.map((p: any) => (
          <Card
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`cursor-pointer transition border ${
              p.bateu
                ? "border-amber-400/80 ring-2 ring-amber-400/40 hover:ring-amber-400/70"
                : "border-border/50 hover:border-rose-500/50"
            }`}
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Avatar className="w-14 h-14 ring-2 ring-primary/30">
                  <AvatarImage src={p.avatar_url} />
                  <AvatarFallback>{initials(p.name)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="font-bold uppercase text-sm truncate">{p.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    Meta diária: {p.dailyGoal} pts
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Total entregue: {p.totalEntregue} • {formatDuracao(p.segundosTotal)}
                  </div>
                </div>
                {p.bateu && (
                  <span className="px-2 py-0.5 rounded-full bg-amber-400 text-amber-950 text-[10px] font-extrabold whitespace-nowrap">
                    🏆 META
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                <ProdCell label="🎬 Vídeos prontos" value={p.videos} accent="text-emerald-500" />
                <ProdCell label="🟡 Em produção" value={p.emProducao} />
                <ProdCell label="⏱ Minutagem (mês)" value={formatDuracao(p.segundos)} />
                <ProdCell label="🔁 Alterações" value={p.alteracoes} />
              </div>
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] mb-1">
                  <span className="text-muted-foreground">
                    Meta do mês ({p.monthGoal} pts • 30s = 1 pt)
                  </span>
                  <span className="font-bold">
                    {p.pontos} pts • {p.pctMeta}%
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full transition-all"
                    style={{
                      width: `${Math.min(100, p.pctMeta)}%`,
                      background: p.bateu
                        ? "linear-gradient(90deg,#f59e0b,#fbbf24,#fde047)"
                        : "#ef4444",
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && (
          <div className="col-span-full text-center py-12 text-sm text-muted-foreground">
            Nenhum produtor encontrado.
          </div>
        )}
      </div>

      {selected && (
        <ProducerAchievements
          producer={selected}
          delivered={delivered}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

function ProducerAchievements({ producer, delivered, onClose }: any) {
  const orders = delivered.filter((o: any) => o.producer_id === producer.id);
  const byDay = new Map<string, any[]>();
  for (const o of orders) {
    const d = String(o.delivered_at).slice(0, 10);
    const arr = byDay.get(d) ?? [];
    arr.push(o);
    byDay.set(d, arr);
  }
  const totalDeliveries = orders.length;
  const maxInDay = Math.max(0, ...Array.from(byDay.values()).map((a) => a.length));
  const perfectDays = Array.from(byDay.values()).filter(
    (a) => a.length >= 10 && a.every((o: any) => Number(o.redo_count ?? 0) === 0),
  ).length;

  const badges = [
    {
      ok: producer.bateu,
      color: "#f59e0b",
      title: "Meta do Mês Batida",
      desc: "Atingiu 100% da meta mensal individual",
    },
    {
      ok: totalDeliveries >= 50,
      color: "#8b5cf6",
      title: "Veterano",
      desc: "50+ vídeos entregues",
    },
    {
      ok: maxInDay >= 10,
      color: "#3b82f6",
      title: "Maratonista",
      desc: "10+ vídeos entregues em um único dia",
    },
    {
      ok: perfectDays >= 1,
      color: "#10b981",
      title: "Dia Perfeito",
      desc: "Um dia com 10+ entregas e zero alterações",
    },
    {
      ok: producer.alteracoes === 0 && producer.videos > 0,
      color: "#22c55e",
      title: "Mão de Ouro",
      desc: "Sem alterações no mês",
    },
    {
      ok: totalDeliveries >= 100,
      color: "#ef4444",
      title: "Lenda",
      desc: "100+ vídeos entregues no histórico",
    },
  ];

  return (
    <Card className="border-amber-400/40" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-5">
        <div className="flex items-center gap-3 mb-4">
          <Avatar className="w-16 h-16 ring-2 ring-amber-400/50">
            <AvatarImage src={producer.avatar_url} />
            <AvatarFallback>{initials(producer.name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="text-lg font-extrabold uppercase">{producer.name}</div>
            <div className="text-xs text-muted-foreground">
              {producer.videos} vídeos no mês • {formatDuracao(producer.segundos)} •{" "}
              {producer.pontos}/{producer.monthGoal} pts
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Fechar
          </Button>
        </div>
        <SectionLabel icon={Award} iconClass="text-amber-500">
          Conquistas
        </SectionLabel>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
          {badges.map((a, i) => (
            <div
              key={i}
              className={`p-3 rounded-xl border ${a.ok ? "bg-card border-border/50" : "bg-muted/20 border-border/30 opacity-50"}`}
              style={{ borderLeft: `4px solid ${a.color}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4" style={{ color: a.color }} />
                <div className="font-bold text-sm">{a.title}</div>
              </div>
              <div className="text-[11px] text-muted-foreground">{a.desc}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <SectionLabel icon={Calendar} iconClass="text-emerald-500">
            Histórico completo de vídeos entregues ({orders.length})
          </SectionLabel>
          {orders.length === 0 ? (
            <div className="mt-3 text-sm text-muted-foreground italic">
              Nenhum vídeo entregue ainda.
            </div>
          ) : (
            <div className="mt-3 max-h-[420px] overflow-y-auto pr-1 space-y-4">
              {Array.from(byDay.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([day, items]) => {
                  const dt = new Date(day + "T12:00:00");
                  const dayLabel = dt.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  });
                  return (
                    <div key={day}>
                      <div className="sticky top-0 z-10 bg-amber-400/20 border border-amber-400/50 text-amber-900 dark:text-amber-200 px-3 py-1.5 rounded-md text-xs font-extrabold uppercase tracking-wide mb-2 flex items-center justify-between">
                        <span>📅 {dayLabel}</span>
                        <span className="text-amber-950 dark:text-amber-100">
                          {items.length} vídeo(s)
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {items
                          .slice()
                          .sort((a: any, b: any) =>
                            String(b.delivered_at).localeCompare(String(a.delivered_at)),
                          )
                          .map((o: any) => (
                            <div
                              key={o.id}
                              className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg border border-border/50 bg-card hover:border-emerald-500/40 transition"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="text-sm font-semibold truncate">
                                  {o.title || "Vídeo"}
                                </div>
                                {Number(o.redo_count ?? 0) > 0 && (
                                  <div className="text-[10px] text-orange-500 font-bold uppercase mt-0.5">
                                    🔁 {o.redo_count} alteração(ões)
                                  </div>
                                )}
                              </div>
                              <div className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-extrabold uppercase tracking-wide whitespace-nowrap">
                                ✓ {fmtDateTime(o.delivered_at)}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ============================ CONQUISTAS ============================ */
export function ConquistasView({ delivered, producers, catName, prodOf }: any) {
  const ranking = useMemo(() => {
    const m = new Map<string, { count: number; sec: number }>();
    for (const p of producers) m.set(p.id, { count: 0, sec: 0 });
    for (const o of delivered) {
      if (!o.producer_id) continue;
      const cur = m.get(o.producer_id) ?? { count: 0, sec: 0 };
      cur.count += 1;
      cur.sec +=
        Number((o as any).video_duration_seconds) ||
        Number((o as any).sales?.video_duration_seconds) ||
        0;
      m.set(o.producer_id, cur);
    }
    return Array.from(m.entries())
      .map(([pid, v]) => ({
        id: pid,
        name: prodOf(pid)?.name ?? "—",
        avatar: prodOf(pid)?.avatar_url,
        count: v.count,
        sec: v.sec,
        pts: Math.floor(v.sec / 30),
      }))
      .sort((a, b) => b.count - a.count || b.pts - a.pts || b.sec - a.sec);
  }, [delivered, producers]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = ranking.find((r) => r.id === selectedId) ?? ranking[0];

  const achievementsFor = (pid: string) => {
    const orders = delivered.filter((o: any) => o.producer_id === pid);
    const byDay = new Map<string, any[]>();
    for (const o of orders) {
      const d = String(o.delivered_at).slice(0, 10);
      const arr = byDay.get(d) ?? [];
      arr.push(o);
      byDay.set(d, arr);
    }
    const perfectDays = Array.from(byDay.values()).filter(
      (arr) =>
        arr.length >= 10 && arr.every((o: any) => !o.updated_at || o.updated_at === o.delivered_at),
    ).length;
    const maxInDay = Math.max(0, ...Array.from(byDay.values()).map((arr) => arr.length));
    const uniqueCats = new Set(orders.map(catName)).size;
    const totalDeliveries = orders.length;
    return [
      {
        ok: perfectDays >= 1,
        color: "#ef4444",
        title: "Dia Perfeito",
        desc: "Entregou 10+ projetos em um dia com ZERO alterações",
      },
      {
        ok: totalDeliveries >= 30,
        color: "#f59e0b",
        title: "Mão de Ouro",
        desc: '10 dias como "Rei do Dia" no mês',
      },
      {
        ok: maxInDay >= 12,
        color: "#10b981",
        title: "Contra Todas as Probabilidades",
        desc: "Entregou 12+ vídeos numa Sexta-feira!",
      },
      {
        ok: totalDeliveries >= 50,
        color: "#8b5cf6",
        title: "Grand Finale",
        desc: "Terminou o mês como Top 1 no último dia útil!",
      },
      {
        ok: maxInDay >= 10,
        color: "#3b82f6",
        title: "Maratonista",
        desc: "Entregou mais de 10 vídeos em um único dia",
      },
      {
        ok: uniqueCats >= 5,
        color: "#ec4899",
        title: "Polivalente",
        desc: "Entregou vídeos em 5+ categorias diferentes",
      },
      {
        ok: totalDeliveries >= 20,
        color: "#64748b",
        title: "Veterano",
        desc: "Alcançou marcos de vídeos entregues",
      },
    ];
  };

  const sel = selected ? achievementsFor(selected.id) : [];
  const conqCount = sel.filter((a) => a.ok).length;
  const level = Math.floor(conqCount / 3) + 1;

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-3">
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-4">
          <SectionLabel icon={Trophy} iconClass="text-amber-500">
            Ranking
          </SectionLabel>
          <div className="space-y-1 mt-3">
            {ranking.map((p, i) => {
              const isSel = selected?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => setSelectedId(p.id)}
                  className={`w-full flex items-center gap-2 p-2 rounded-lg text-left transition ${isSel ? "bg-rose-500/10 border border-rose-500/50" : "hover:bg-muted"}`}
                >
                  <span className="text-xs font-bold text-muted-foreground w-4">{i + 1}</span>
                  <Avatar className="w-9 h-9 ring-2 ring-primary/30">
                    <AvatarImage src={p.avatar} />
                    <AvatarFallback className="text-[9px]">{initials(p.name)}</AvatarFallback>
                  </Avatar>
                  <span className="text-xs font-bold uppercase flex-1 truncate">{p.name}</span>
                  <div className="flex flex-col items-end leading-tight">
                    <span className="text-xs font-bold text-rose-500">{p.count}</span>
                    <span className="text-[10px] font-semibold text-amber-500">{p.pts} pts</span>
                    <span className="text-[10px] font-semibold text-muted-foreground">
                      {formatDuracao(p.sec)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          {!selected ? (
            <div className="text-center py-12 text-muted-foreground">Selecione um produtor</div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="w-20 h-20 ring-2 ring-primary/40">
                  <AvatarImage src={selected.avatar} />
                  <AvatarFallback>{initials(selected.name)}</AvatarFallback>
                </Avatar>
                <div>
                  <div className="text-xl font-bold uppercase">{selected.name}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="px-2 py-0.5 rounded bg-rose-500 text-white text-[10px] font-bold">
                      {conqCount} Conquistas
                    </span>
                    <span className="text-xs text-muted-foreground">Nível {level}</span>
                  </div>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {sel.map((a, i) => (
                  <div
                    key={i}
                    className={`p-3 rounded-xl border ${a.ok ? "bg-card border-border/50" : "bg-muted/20 border-border/30 opacity-50"}`}
                    style={{ borderLeft: `4px solid ${a.color}` }}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Award className="w-4 h-4" style={{ color: a.color }} />
                      <div className="font-bold text-sm">{a.title}</div>
                    </div>
                    <div className="text-[11px] text-muted-foreground">{a.desc}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================ RELATÓRIOS ============================ */
export function RelatoriosView({ delivered, producers, computePts, sumPts }: any) {
  const [period, setPeriod] = useState<"diario" | "semanal" | "mensal">("diario");

  const range = useMemo(() => {
    const end = today();
    if (period === "diario")
      return { start: end, end, label: `DIÁRIO COMPLETO - ${fmtBR(end)}/${end.slice(0, 4)}` };
    if (period === "semanal") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      return { start: ymd(d), end, label: `SEMANAL - ${fmtBR(ymd(d))} a ${fmtBR(end)}` };
    }
    return { start: monthStart(0), end, label: `MENSAL - ${monthLabel(monthStart(0))}` };
  }, [period]);

  const orders = delivered.filter((o: any) => {
    const d = String(o.delivered_at).slice(0, 10);
    return d >= range.start && d <= range.end;
  });
  const pts = sumPts(orders);
  const proj = orders.length;
  const alt = orders.reduce((a: number, o: any) => a + Number(o.redo_count ?? 0), 0);
  const prods = new Set(orders.map((o: any) => o.producer_id).filter(Boolean));

  const perProducer = useMemo(() => {
    const m = new Map<string, { name: string; pts: number; proj: number; alt: number }>();
    for (const o of orders) {
      if (!o.producer_id) continue;
      const prod = producers.find((p: any) => p.id === o.producer_id);
      const cur = m.get(o.producer_id) ?? { name: prod?.name ?? "—", pts: 0, proj: 0, alt: 0 };
      cur.pts += computePts(o);
      cur.proj += 1;
      cur.alt += Number(o.redo_count ?? 0);
      m.set(o.producer_id, cur);
    }
    return Array.from(m.values()).sort((a, b) => b.pts - a.pts);
  }, [orders, producers]);

  const generatedAt = new Date().toLocaleString("pt-BR");

  const text = useMemo(() => {
    const lines: string[] = [];
    lines.push(`📊 RELATÓRIO ${range.label}`);
    lines.push("━".repeat(40));
    lines.push("");
    lines.push("📈 RESUMO");
    lines.push(`• Pontuação Total: ${Math.round(pts)} pts`);
    lines.push(`• Projetos Concluídos: ${proj}`);
    lines.push(`• Alterações: ${alt}`);
    lines.push(`• Produtores Ativos: ${prods.size}`);
    lines.push(`• Média por Produtor: ${prods.size > 0 ? Math.round(pts / prods.size) : 0} pts`);
    lines.push("");
    lines.push(`📋 PRODUÇÃO DETALHADA (${perProducer.length} produtores)`);
    for (const p of perProducer) {
      lines.push(`• ${p.name}: ${Math.round(p.pts)} pts | ${p.proj} proj | ${p.alt} alt`);
    }
    lines.push("");
    lines.push("━".repeat(40));
    lines.push(`Gerado em ${generatedAt}`);
    return lines.join("\n");
  }, [range, pts, proj, alt, prods, perProducer, generatedAt]);

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Relatório copiado!");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-rose-500" /> Gerador de Relatórios
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Gere relatórios formatados para compartilhar no WhatsApp, email ou imprimir
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        {(["diario", "semanal", "mensal"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPeriod(p)}
            className={`p-5 rounded-xl border text-center transition ${period === p ? "bg-rose-500/10 border-rose-500 shadow-lg" : "bg-card border-border/50 hover:border-border"}`}
          >
            <Calendar
              className={`w-8 h-8 mx-auto mb-2 ${period === p ? "text-rose-500" : "text-muted-foreground"}`}
            />
            <div className={`font-bold ${period === p ? "text-rose-500" : ""}`}>
              {p === "diario" ? "Diário" : p === "semanal" ? "Semanal" : "Mensal"}
            </div>
          </button>
        ))}
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="font-bold flex items-center gap-2">
              <FileText className="w-4 h-4 text-rose-500" /> Prévia do Relatório
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyText} className="gap-1">
                <Copy className="w-3 h-3" /> Copiar
              </Button>
              <Button size="sm" onClick={() => window.print()} className="gap-1">
                <Printer className="w-3 h-3" /> Imprimir
              </Button>
            </div>
          </div>
          <pre className="text-xs font-mono whitespace-pre-wrap p-4 rounded-lg bg-muted/30 border border-border/30 overflow-x-auto">
            {text}
          </pre>
        </CardContent>
      </Card>

      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="p-4 text-xs">
          <span className="font-bold">💡 Dica:</span> Use o botão "Copiar" para colar o relatório
          diretamente no WhatsApp ou email. O formato é otimizado para visualização em texto
          simples.
        </CardContent>
      </Card>
    </div>
  );
}

/* ============================ HELPERS ============================ */
function SectionLabel({ icon: Icon, iconClass = "", children }: any) {
  return (
    <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold flex items-center gap-1.5">
      <Icon className={`w-3 h-3 ${iconClass}`} /> {children}
    </div>
  );
}
function MiniStat({ icon: Icon, label, value, suffix, valueClass, size }: any) {
  const lg = size === "lg";
  return (
    <div
      className={`rounded-xl bg-muted/40 border border-border/40 ${lg ? "p-5 flex-1 flex flex-col justify-center" : "p-3"}`}
    >
      <div
        className={`uppercase text-muted-foreground flex items-center gap-1.5 font-medium tracking-wide ${lg ? "text-xs" : "text-[10px]"}`}
      >
        <Icon className={lg ? "w-4 h-4" : "w-3 h-3"} /> {label}
      </div>
      <div className={`font-bold mt-2 ${lg ? "text-3xl" : "text-xl"} ${valueClass ?? ""}`}>
        {value}{" "}
        {suffix && (
          <span className={`text-muted-foreground ${lg ? "text-sm" : "text-xs"}`}>{suffix}</span>
        )}
      </div>
    </div>
  );
}
function BigKpi({ label, value, accent = "" }: any) {
  const isPts = typeof label === "string" && /pontos/i.test(label);
  const n = Number(value);
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-5">
        <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-semibold">
          {label}
        </div>
        <div className={`text-4xl font-extrabold mt-2 ${accent}`}>{value}</div>
        {isPts && Number.isFinite(n) && (
          <div className="text-[11px] text-muted-foreground mt-1">≡ {n.toFixed(0)} vídeos</div>
        )}
      </CardContent>
    </Card>
  );
}
function HighlightCard({ title, icon: Icon, producer, valueLabel }: any) {
  const ptsMatch = typeof valueLabel === "string" ? valueLabel.match(/^(\d+)\s*pts$/i) : null;
  return (
    <div className="p-4 rounded-xl border border-border/40 bg-muted/20 text-center">
      <div className="text-[10px] uppercase text-muted-foreground flex items-center justify-center gap-1 font-semibold mb-2">
        <Icon className="w-3 h-3" /> {title}
      </div>
      {producer ? (
        <>
          <Avatar className="w-16 h-16 mx-auto mb-2 ring-2 ring-primary/30">
            <AvatarImage src={producer.avatar_url} />
            <AvatarFallback>{initials(producer.name)}</AvatarFallback>
          </Avatar>
          <div className="font-bold text-sm uppercase truncate">{producer.name}</div>
          <div className="text-xs text-rose-500 font-bold mt-1">{valueLabel}</div>
          {ptsMatch && (
            <div className="text-[10px] text-muted-foreground">≡ {ptsMatch[1]} vídeos</div>
          )}
        </>
      ) : (
        <div className="text-muted-foreground text-sm py-4">—</div>
      )}
    </div>
  );
}
function CompCol({ title, pts, projetos, alteracoes, produtores, approv, side, diff }: any) {
  return (
    <div
      className={`p-4 rounded-xl border border-border/30 bg-muted/20 ${side === "right" ? "border-rose-500/40" : ""}`}
    >
      <div className="flex items-center justify-between text-xs font-bold mb-3">
        <span className={side === "right" ? "text-rose-500" : ""}>📅 {title}</span>
        {diff && <span className="text-[10px] text-emerald-500">{diff.pts}</span>}
      </div>
      <div className="space-y-1.5 text-sm">
        <Row
          label="Pontuação"
          v={`${Math.round(pts)} pts`}
          accent="text-blue-400"
          sub={`≡ ${Math.round(pts)} vídeos`}
        />
        <Row label="Projetos" v={String(projetos)} />
        <Row label="Alterações" v={String(alteracoes)} />
        <Row label="Produtores" v={String(produtores)} />
        <Row
          label="Taxa de Aprovação"
          v={`${approv}%`}
          accent={approv >= 70 ? "text-emerald-500" : "text-rose-500"}
        />
      </div>
    </div>
  );
}
function Row({ label, v, accent = "", sub }: any) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">
        <span className={`font-bold ${accent}`}>{v}</span>
        {sub && <span className="block text-[10px] text-muted-foreground font-normal">{sub}</span>}
      </span>
    </div>
  );
}
function RewardChip({ pct, label, active, highlight }: any) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs ${
        highlight && active
          ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
          : active
            ? "bg-muted border-border"
            : "bg-muted/30 border-border/30 text-muted-foreground"
      }`}
    >
      <span className="font-bold">{pct}%</span>
      <span>{label}</span>
      {active && <span>✓</span>}
    </div>
  );
}
function MetricBlock({ value, label, emoji }: any) {
  return (
    <div className="p-4 rounded-xl bg-muted/20 border border-border/30 text-center">
      <div className="text-xs">{emoji}</div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  );
}
function TrendKpi({ label, value, sub, positive, accent }: any) {
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-4">
        <div className="text-[11px] text-muted-foreground flex items-center gap-1">— {label}</div>
        <div
          className={`text-3xl font-extrabold mt-1 ${accent ?? (positive ? "text-foreground" : "text-rose-500")}`}
        >
          {value}
        </div>
        <div className="text-[10px] text-muted-foreground mt-1">{sub}</div>
      </CardContent>
    </Card>
  );
}
function ChartCard({ title, icon: Icon, accent, children }: any) {
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardContent className="p-5">
        <div className="font-bold flex items-center gap-2 text-sm">
          <Icon className={`w-4 h-4 ${accent}`} /> {title}
        </div>
        <div className="h-[260px] mt-3">{children}</div>
      </CardContent>
    </Card>
  );
}
function ProdCell({ label, value, accent = "" }: any) {
  return (
    <div className="p-2 rounded-lg bg-muted/30 border border-border/30">
      <div className="text-[9px] text-muted-foreground uppercase">{label}</div>
      <div className={`text-lg font-extrabold ${accent}`}>{value}</div>
    </div>
  );
}

export const OM_MENU = [
  { key: "visao-geral", label: "Visão Geral", path: "/operacao-meta/visao-geral", icon: BarChart3 },
  { key: "produtores", label: "Produtores", path: "/operacao-meta/produtores", icon: Users },
  { key: "tendencias", label: "Tendências", path: "/operacao-meta/tendencias", icon: LineIcon },
  { key: "relatorios", label: "Relatórios", path: "/operacao-meta/relatorios", icon: FileText },
] as const;
