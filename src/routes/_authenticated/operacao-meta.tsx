import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Target, Trophy, Film, Sparkles, CheckCircle2, Flame } from "lucide-react";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend,
} from "recharts";

export const Route = createFileRoute("/_authenticated/operacao-meta")({
  component: OperacaoMetaPage,
});

type Period = "day" | "week" | "month";

function startOf(p: Period): string {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  if (p === "week") { const dow = d.getDay(); d.setDate(d.getDate() - dow); }
  if (p === "month") d.setDate(1);
  return d.toISOString().slice(0, 10);
}

function fmtVideoDuration(sec?: number | null): string {
  if (!sec || sec < 1) return "—";
  const m = Math.floor(sec / 60), s = sec % 60;
  return m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
}

function OperacaoMetaPage() {
  const qc = useQueryClient();
  const [period, setPeriod] = useState<Period>("day");
  const since = startOf(period);

  const producers = useQuery({
    queryKey: ["om-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name,daily_points_goal,active")).data ?? [],
  });
  const orders = useQuery({
    queryKey: ["om-orders"],
    queryFn: async () =>
      (await supabase
        .from("service_orders")
        .select("id,producer_id,sale_id,delivered_at,column_id,kanban_columns(is_done),sales(service_type_id,package_id,video_duration_seconds,service_types(name,points_value),packages(name,points_value))")
      ).data ?? [],
  });
  const serviceTypes = useQuery({
    queryKey: ["om-services"],
    queryFn: async () => (await supabase.from("service_types").select("id,name,points_value")).data ?? [],
  });

  const inScope = (d?: string | null) => !!d && d.slice(0, 10) >= since;

  const delivered = useMemo(
    () => (orders.data ?? []).filter((o: any) => inScope(o.delivered_at)),
    [orders.data, since],
  );

  const ranking = useMemo(() => {
    const map = new Map<string, { id: string; name: string; goal: number; videos: number; points: number; byType: Record<string, number>; durations: number[] }>();
    for (const p of producers.data ?? []) {
      map.set(p.id, { id: p.id, name: p.name, goal: Number(p.daily_points_goal ?? 7), videos: 0, points: 0, byType: {}, durations: [] });
    }
    for (const o of delivered) {
      const pid = o.producer_id; if (!pid || !map.has(pid)) continue;
      const sale: any = o.sales || {};
      const pkg = sale.packages;
      const st = sale.service_types;
      const points = Number((pkg?.points_value ?? st?.points_value) ?? 0);
      const typeName = pkg?.name ?? st?.name ?? "Outro";
      const e = map.get(pid)!;
      e.videos += 1;
      e.points += points;
      e.byType[typeName] = (e.byType[typeName] ?? 0) + 1;
      if (sale.video_duration_seconds) e.durations.push(Number(sale.video_duration_seconds));
    }
    return Array.from(map.values())
      .filter((r) => r.videos > 0 || r.points > 0)
      .sort((a, b) => b.points - a.points || b.videos - a.videos);
  }, [producers.data, delivered]);

  const totals = useMemo(() => {
    return ranking.reduce(
      (a, r) => ({ videos: a.videos + r.videos, points: a.points + r.points }),
      { videos: 0, points: 0 },
    );
  }, [ranking]);

  const typeBreakdown = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of ranking) for (const [k, v] of Object.entries(r.byType)) m.set(k, (m.get(k) ?? 0) + v);
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [ranking]);

  const updateGoal = async (id: string, v: string) => {
    const n = Number(v); if (!Number.isFinite(n) || n < 0) { toast.error("Meta inválida"); return; }
    const { error } = await supabase.from("producers").update({ daily_points_goal: n }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Meta atualizada"); qc.invalidateQueries({ queryKey: ["om-producers"] });
  };

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16"];

  const periodLabel = period === "day" ? "Hoje" : period === "week" ? "Semana" : "Mês";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Sparkles className="w-7 h-7 text-primary" /> Operação Meta
          </h1>
          <p className="text-muted-foreground">Pontuação por produtor • cada produto vale pontos configuráveis</p>
        </div>
        <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as Period)} size="sm">
          <ToggleGroupItem value="day">Dia</ToggleGroupItem>
          <ToggleGroupItem value="week">Semana</ToggleGroupItem>
          <ToggleGroupItem value="month">Mês</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Vídeos produzidos", value: totals.videos, icon: Film, color: "text-blue-500" },
          { label: "Pontos totais", value: totals.points.toFixed(1), icon: Sparkles, color: "text-amber-500" },
          { label: "Produtores ativos", value: ranking.length, icon: Trophy, color: "text-emerald-500" },
          { label: "Meta padrão (dia)", value: "7 pts", icon: Target, color: "text-violet-500" },
        ].map((c) => {
          const Icon = c.icon;
          return (
            <Card key={c.label} className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
              <CardContent className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                  <p className="text-2xl font-bold tracking-tight">{c.value}</p>
                </div>
                <Icon className={`w-9 h-9 ${c.color}`} />
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trophy className="w-4 h-4 text-amber-500" /> Ranking — {periodLabel}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ranking.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma produção registrada no período.</p>}
            {ranking.map((r, i) => {
              const goal = period === "day" ? r.goal : period === "week" ? r.goal * 7 : r.goal * 30;
              const pct = goal > 0 ? Math.min(100, (r.points / goal) * 100) : 0;
              const hit = r.points >= goal && goal > 0;
              return (
                <div
                  key={r.id}
                  className="p-3 rounded-xl border-2 transition-all"
                  style={{
                    background: hit ? "linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.04))" : "hsl(var(--muted) / 0.3)",
                    borderColor: hit ? "#10b981" : "hsl(var(--border) / 0.5)",
                  }}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                        i === 0 ? "bg-amber-500 text-white" : i === 1 ? "bg-zinc-400 text-white" : i === 2 ? "bg-amber-700 text-white" : "bg-primary/15 text-primary"
                      }`}>{i + 1}</div>
                      <div className="min-w-0">
                        <div className="font-semibold truncate flex items-center gap-2">
                          {r.name}
                          {hit && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                          {i === 0 && r.points > 0 && <Flame className="w-4 h-4 text-orange-500" />}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.videos} vídeo{r.videos === 1 ? "" : "s"} • meta {goal} pts
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-2xl font-bold ${hit ? "text-emerald-500" : ""}`}>{r.points.toFixed(1)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">pontos</div>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2 mt-2" />
                  {Object.keys(r.byType).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {Object.entries(r.byType).map(([t, n]) => (
                        <Badge key={t} variant="secondary" className="text-[10px]">{t}: {n}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardHeader><CardTitle className="text-base">Tipos de vídeo</CardTitle></CardHeader>
          <CardContent className="h-[300px]">
            {typeBreakdown.length === 0 ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem dados.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={typeBreakdown} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90}>
                    {typeBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader><CardTitle className="text-base">Pontos por produtor</CardTitle></CardHeader>
        <CardContent className="h-[280px]">
          {ranking.length === 0 ? (
            <div className="h-full flex items-center justify-center text-sm text-muted-foreground">Sem produção no período.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranking.map((r) => ({ name: r.name, Pontos: Number(r.points.toFixed(1)), Vídeos: r.videos }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
                <Legend />
                <Bar dataKey="Pontos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vídeos" fill="#10b981" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader><CardTitle className="text-base">Meta diária por produtor</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Produtor</TableHead>
                <TableHead className="text-center">Meta diária (pts)</TableHead>
                <TableHead className="text-center">Vídeos no período</TableHead>
                <TableHead className="text-center">Pontos no período</TableHead>
                <TableHead className="text-center">Duração média</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(producers.data ?? []).map((p: any) => {
                const r = ranking.find((x) => x.id === p.id);
                const avg = r && r.durations.length ? r.durations.reduce((a, n) => a + n, 0) / r.durations.length : 0;
                return (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-center">
                      <Input
                        type="number" step="0.5" min="0"
                        defaultValue={p.daily_points_goal ?? 7}
                        onBlur={(e) => { if (Number(e.target.value) !== Number(p.daily_points_goal)) updateGoal(p.id, e.target.value); }}
                        className="h-8 w-24 text-center mx-auto"
                      />
                    </TableCell>
                    <TableCell className="text-center">{r?.videos ?? 0}</TableCell>
                    <TableCell className="text-center font-semibold">{(r?.points ?? 0).toFixed(1)}</TableCell>
                    <TableCell className="text-center text-muted-foreground">{fmtVideoDuration(avg)}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" /> Pontuação dos produtos
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground mb-3">
            Configure quanto cada produto vale em <strong>Configurações → Tipos de Serviço</strong> e <strong>Configurações → Pacotes</strong>.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {(serviceTypes.data ?? []).map((s: any) => (
              <div key={s.id} className="p-2 rounded-md border border-border/50 bg-muted/30 flex items-center justify-between">
                <span className="text-sm truncate">{s.name}</span>
                <Badge variant="secondary" className="font-semibold">{Number(s.points_value ?? 0)} pts</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}