import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { DollarSign, TrendingUp, Calendar, Trophy, Users, Briefcase, Sparkles } from "lucide-react";
import confetti from "canvas-confetti";

export const Route = createFileRoute("/_authenticated/telao")({
  component: Telao,
});

type SaleRow = {
  id: string;
  total_amount: number;
  created_at: string;
  sale_date: string;
  seller_id: string | null;
  producer_id: string | null;
  customer_id: string;
  payment_method: string | null;
};

function startOfDay() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfWeek() { const d = startOfDay(); d.setDate(d.getDate() - d.getDay()); return d; }
function startOfMonth() { const d = startOfDay(); d.setDate(1); return d; }

// Beep/buzina via Web Audio API (sem necessidade de arquivo de áudio)
function playHorn() {
  try {
    const AudioCtx = (window.AudioContext || (window as any).webkitAudioContext);
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const notes = [
      { f: 440, t: 0.0, d: 0.18 },
      { f: 330, t: 0.18, d: 0.18 },
      { f: 587, t: 0.38, d: 0.35 },
    ];
    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = n.f;
      gain.gain.setValueAtTime(0.0001, now + n.t);
      gain.gain.exponentialRampToValueAtTime(0.35, now + n.t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.05);
    });
    setTimeout(() => ctx.close(), 1500);
  } catch {}
}

function fireConfetti() {
  const end = Date.now() + 1500;
  const colors = ["#10b981", "#3b82f6", "#f59e0b", "#ef4444", "#a855f7"];
  (function frame() {
    confetti({ particleCount: 5, angle: 60, spread: 70, origin: { x: 0, y: 0.7 }, colors });
    confetti({ particleCount: 5, angle: 120, spread: 70, origin: { x: 1, y: 0.7 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

function Telao() {
  const qc = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const salesQ = useQuery({
    queryKey: ["telao-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id,total_amount,created_at,sale_date,seller_id,producer_id,customer_id,payment_method")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
    refetchInterval: 15000,
  });

  const customersQ = useQuery({
    queryKey: ["telao-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name")).data ?? [],
  });
  const sellersQ = useQuery({
    queryKey: ["telao-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name")).data ?? [],
  });
  const producersQ = useQuery({
    queryKey: ["telao-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name")).data ?? [],
  });

  const sales = salesQ.data ?? [];
  const customers = customersQ.data ?? [];
  const sellers = sellersQ.data ?? [];
  const producers = producersQ.data ?? [];

  const cName = (id: string) => customers.find((c: any) => c.id === id)?.name ?? "Cliente";
  const sName = (id: string | null) => sellers.find((s: any) => s.id === id)?.name ?? "—";
  const pName = (id: string | null) => producers.find((p: any) => p.id === id)?.name ?? "—";

  const today0 = startOfDay();
  const week0 = startOfWeek();
  const month0 = startOfMonth();

  const todaySales = sales.filter((s) => new Date(s.created_at) >= today0);
  const weekSales = sales.filter((s) => new Date(s.created_at) >= week0);
  const monthSales = sales.filter((s) => new Date(s.created_at) >= month0);

  const sum = (arr: SaleRow[]) => arr.reduce((a, s) => a + Number(s.total_amount || 0), 0);

  // Ranking vendedores e produtores no mês
  const rankBy = (key: "seller_id" | "producer_id") => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    monthSales.forEach((s) => {
      const id = (s as any)[key];
      if (!id) return;
      const name = key === "seller_id" ? sName(id) : pName(id);
      const cur = map.get(id) ?? { name, total: 0, qtd: 0 };
      cur.total += Number(s.total_amount || 0);
      cur.qtd += 1;
      map.set(id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  };

  const topSellers = rankBy("seller_id");
  const topProducers = rankBy("producer_id");

  // Realtime: nova venda → confetti + buzina + flash
  useEffect(() => {
    const channel = supabase
      .channel("telao-sales")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, () => {
        qc.invalidateQueries({ queryKey: ["telao-sales"] });
        fireConfetti();
        if (soundEnabled) playHorn();
        setFlash(true);
        setTimeout(() => setFlash(false), 1800);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, soundEnabled]);

  // Detecta crescimento por polling como fallback
  useEffect(() => {
    if (lastCount !== null && todaySales.length > lastCount) {
      fireConfetti();
      if (soundEnabled) playHorn();
      setFlash(true);
      setTimeout(() => setFlash(false), 1800);
    }
    setLastCount(todaySales.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaySales.length]);

  // Auto-scroll loop nas vendas do dia
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || todaySales.length === 0) return;
    let raf = 0;
    const tick = () => {
      if (!el) return;
      el.scrollTop += 0.6;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        el.scrollTop = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [todaySales.length]);

  const now = new Date();

  return (
    <div className={`min-h-screen p-6 transition-colors ${flash ? "bg-emerald-500/10" : ""}`}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-black tracking-tight flex items-center gap-3">
            <Sparkles className="w-8 h-8 text-primary" /> Telão de Vendas
          </h1>
          <p className="text-muted-foreground">{fmtDate(now)} • Atualização em tempo real</p>
        </div>
        <button
          onClick={() => { setSoundEnabled((v) => !v); if (!soundEnabled) playHorn(); }}
          className={`px-4 py-2 rounded-lg font-semibold border ${soundEnabled ? "bg-emerald-500 text-white border-emerald-600" : "bg-card border-border"}`}
        >
          {soundEnabled ? "🔊 Som ON" : "🔇 Ativar buzina"}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="p-6 bg-gradient-to-br from-emerald-500/20 to-emerald-500/5 border-emerald-500/30">
          <div className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-widest text-emerald-400">Hoje</span>
            <Calendar className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="mt-2 text-4xl font-black">{formatCurrency(sum(todaySales))}</div>
          <div className="text-sm text-muted-foreground mt-1">{todaySales.length} venda(s)</div>
        </Card>
        <Card className="p-6 bg-gradient-to-br from-blue-500/20 to-blue-500/5 border-blue-500/30">
          <div className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-widest text-blue-400">Semana</span>
            <TrendingUp className="w-5 h-5 text-blue-400" />
          </div>
          <div className="mt-2 text-4xl font-black">{formatCurrency(sum(weekSales))}</div>
          <div className="text-sm text-muted-foreground mt-1">{weekSales.length} venda(s)</div>
        </Card>
        <Card className="p-6 bg-gradient-to-br from-amber-500/20 to-amber-500/5 border-amber-500/30">
          <div className="flex items-center justify-between">
            <span className="text-sm uppercase tracking-widest text-amber-400">Mês</span>
            <DollarSign className="w-5 h-5 text-amber-400" />
          </div>
          <div className="mt-2 text-4xl font-black">{formatCurrency(sum(monthSales))}</div>
          <div className="text-sm text-muted-foreground mt-1">{monthSales.length} venda(s)</div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Vendas do dia em loop */}
        <Card className="lg:col-span-2 p-4 overflow-hidden">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" /> Vendas de hoje
            </h2>
            <Badge variant="secondary">{todaySales.length} hoje</Badge>
          </div>
          <div ref={scrollRef} className="h-[480px] overflow-hidden space-y-2 pr-2">
            {todaySales.length === 0 && (
              <div className="text-center text-muted-foreground py-20">
                Nenhuma venda registrada hoje ainda. Bora vender! 🚀
              </div>
            )}
            {[...todaySales, ...todaySales].map((s, i) => (
              <div
                key={`${s.id}-${i}`}
                className="flex items-center justify-between p-3 rounded-lg bg-card border border-border hover:border-primary/50 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{cName(s.customer_id)}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    Vendedor: {sName(s.seller_id)} • {fmtTime(s.created_at)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-black text-emerald-400">
                    {formatCurrency(Number(s.total_amount || 0))}
                  </div>
                  <div className="text-[10px] uppercase text-muted-foreground">{s.payment_method ?? "—"}</div>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Rankings */}
        <div className="space-y-4">
          <Card className="p-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" /> Top Vendedores (mês)
            </h2>
            <div className="space-y-2">
              {topSellers.length === 0 && <div className="text-sm text-muted-foreground">Sem dados</div>}
              {topSellers.map((r, i) => (
                <div key={r.name + i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i===0?"bg-amber-400 text-black":i===1?"bg-slate-300 text-black":i===2?"bg-orange-400 text-black":"bg-muted"}`}>{i+1}</span>
                    <span className="font-semibold truncate flex items-center gap-1"><Users className="w-3 h-3" />{r.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-emerald-400">{formatCurrency(r.total)}</div>
                    <div className="text-[10px] text-muted-foreground">{r.qtd} venda(s)</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
              <Briefcase className="w-5 h-5 text-blue-400" /> Top Produtores (mês)
            </h2>
            <div className="space-y-2">
              {topProducers.length === 0 && <div className="text-sm text-muted-foreground">Sem dados</div>}
              {topProducers.map((r, i) => (
                <div key={r.name + i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black ${i===0?"bg-amber-400 text-black":i===1?"bg-slate-300 text-black":i===2?"bg-orange-400 text-black":"bg-muted"}`}>{i+1}</span>
                    <span className="font-semibold truncate">{r.name}</span>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-blue-400">{formatCurrency(r.total)}</div>
                    <div className="text-[10px] text-muted-foreground">{r.qtd} venda(s)</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}