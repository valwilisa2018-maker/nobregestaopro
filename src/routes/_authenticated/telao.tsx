import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { Maximize2, Minimize2, Volume2, VolumeX, ArrowUpRight } from "lucide-react";
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
  const [kiosk, setKiosk] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [clock, setClock] = useState<string>(() => new Date().toLocaleTimeString("pt-BR"));
  useEffect(() => {
    const id = setInterval(() => setClock(new Date().toLocaleTimeString("pt-BR")), 1000);
    return () => clearInterval(id);
  }, []);

  const toggleKiosk = async () => {
    try {
      if (!document.fullscreenElement) {
        await rootRef.current?.requestFullscreen?.();
        setKiosk(true);
      } else {
        await document.exitFullscreen?.();
        setKiosk(false);
      }
    } catch {
      setKiosk((v) => !v);
    }
  };

  useEffect(() => {
    const onFs = () => setKiosk(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setKiosk(false);
      if (e.key.toLowerCase() === "f") toggleKiosk();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

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
    <div
      ref={rootRef}
      style={{
        fontFamily: '"Barlow", system-ui, sans-serif',
        backgroundColor: "#0d0d0d",
        color: "#f5f5f5",
        backgroundImage:
          "radial-gradient(circle at 15% 0%, rgba(201,168,76,0.08), transparent 45%), radial-gradient(circle at 100% 100%, rgba(201,168,76,0.05), transparent 50%)",
      }}
      className={`min-h-screen p-6 transition-all ${flash ? "ring-4 ring-[#c9a84c]/60" : ""}`}
    >
      {/* HEADER */}
      <header className="flex items-center justify-between mb-6 pb-4 border-b border-[#c9a84c]/20">
        <div className="flex items-center gap-4">
          <div className="w-1 h-12 bg-gradient-to-b from-[#f0d78c] to-[#c9a84c]" />
          <div>
            <h1
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.04em" }}
              className={`leading-none text-[#f5f5f5] ${kiosk ? "text-6xl" : "text-5xl"}`}
            >
              TELÃO <span className="text-[#c9a84c]">DE VENDAS</span>
            </h1>
            <p className="text-xs uppercase tracking-[0.3em] text-[#c9a84c]/70 mt-1">
              {fmtDate(now)} · ao vivo
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
            className="hidden md:block text-4xl text-[#f0d78c] tabular-nums"
          >
            {clock}
          </div>
          <button
            onClick={() => { setSoundEnabled((v) => !v); if (!soundEnabled) playHorn(); }}
            className={`h-10 w-10 grid place-items-center rounded border transition ${soundEnabled ? "bg-[#c9a84c] text-black border-[#c9a84c]" : "bg-[#1a1a1a] border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c]"}`}
            title={soundEnabled ? "Som ON" : "Ativar buzina"}
          >
            {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
          <button
            onClick={toggleKiosk}
            title="Modo Kiosk (tela cheia) — tecla F"
            className="h-10 px-4 grid place-items-center rounded border bg-[#1a1a1a] border-[#c9a84c]/30 text-[#c9a84c] hover:border-[#c9a84c] transition"
          >
            {kiosk ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* BENTO GRID */}
      <div className="grid grid-cols-12 gap-4 auto-rows-auto">
        {/* HERO HOJE */}
        <div
          className="col-span-12 lg:col-span-6 row-span-2 relative overflow-hidden rounded-lg p-8 border border-[#c9a84c]/30"
          style={{
            background:
              "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 60%, #1a1a1a 100%)",
          }}
        >
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-20 blur-3xl"
            style={{ background: "radial-gradient(circle, #c9a84c 0%, transparent 70%)" }}
          />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <span className="text-xs uppercase tracking-[0.4em] text-[#c9a84c]">Faturamento · Hoje</span>
              <span className="text-xs uppercase tracking-widest text-[#f0d78c]/60 flex items-center gap-1">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> tempo real
              </span>
            </div>
            <div
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.01em" }}
              className="text-[clamp(3.5rem,9vw,8rem)] leading-none text-transparent bg-clip-text bg-gradient-to-br from-[#f0d78c] via-[#c9a84c] to-[#a07d2a] tabular-nums"
            >
              {formatCurrency(sum(todaySales))}
            </div>
            <div className="mt-6 flex items-end justify-between border-t border-[#c9a84c]/15 pt-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/60">Operações</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-white tabular-nums">
                  {todaySales.length}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/60">Ticket médio</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-white tabular-nums">
                  {formatCurrency(todaySales.length ? sum(todaySales) / todaySales.length : 0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEMANA */}
        <KpiBlock label="Semana" value={sum(weekSales)} count={weekSales.length} />
        {/* MÊS */}
        <KpiBlock label="Mês" value={sum(monthSales)} count={monthSales.length} accent />

        {/* TICKER VENDAS DO DIA */}
        <div className="col-span-12 lg:col-span-8 rounded-lg border border-[#c9a84c]/20 bg-[#111]/80 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-[#c9a84c]/15">
            <h2
              style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
              className="text-2xl text-[#f0d78c]"
            >
              VENDAS DO DIA
            </h2>
            <span className="text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/70">
              {todaySales.length} registros
            </span>
          </div>
          <div ref={scrollRef} className="h-[460px] overflow-hidden">
            {todaySales.length === 0 && (
              <div className="h-full grid place-items-center text-[#c9a84c]/40 uppercase tracking-widest text-sm">
                Aguardando primeira venda
              </div>
            )}
            <ul>
              {[...todaySales, ...todaySales].map((s, i) => {
                const name = cName(s.customer_id);
                const initial = (name?.[0] ?? "?").toUpperCase();
                return (
                  <li
                    key={`${s.id}-${i}`}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 border-b border-[#c9a84c]/8 hover:bg-[#c9a84c]/5 transition"
                  >
                    <div className="w-10 h-10 rounded grid place-items-center border border-[#c9a84c]/30 bg-[#1a1a1a] text-[#c9a84c] font-bold">
                      {initial}
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-white truncate">{name}</div>
                      <div className="text-[11px] uppercase tracking-wider text-[#c9a84c]/60 truncate">
                        {sName(s.seller_id)} · {fmtTime(s.created_at)} · {s.payment_method ?? "—"}
                      </div>
                    </div>
                    <div
                      style={{ fontFamily: '"Bebas Neue", sans-serif' }}
                      className="text-2xl text-[#f0d78c] tabular-nums"
                    >
                      {formatCurrency(Number(s.total_amount || 0))}
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-[#c9a84c]/60" />
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        {/* PÓDIOS */}
        <div className="col-span-12 lg:col-span-4 space-y-4">
          <Podium title="Top Vendedores" rows={topSellers} />
          <Podium title="Top Produtores" rows={topProducers} />
        </div>
      </div>

      <footer className="mt-6 pt-4 border-t border-[#c9a84c]/15 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/40">
        <span>Gestão Nobre · sala de operações</span>
        <span>Pressione F para tela cheia · Esc para sair</span>
      </footer>
    </div>
  );
}

function KpiBlock({ label, value, count, accent }: { label: string; value: number; count: number; accent?: boolean }) {
  return (
    <div
      className={`col-span-6 lg:col-span-3 rounded-lg border p-5 relative overflow-hidden ${accent ? "border-[#c9a84c]/40 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]" : "border-[#c9a84c]/20 bg-[#111]"}`}
    >
      <div className="text-[10px] uppercase tracking-[0.35em] text-[#c9a84c]/70">{label}</div>
      <div
        style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
        className={`mt-3 text-4xl tabular-nums leading-none ${accent ? "text-[#f0d78c]" : "text-white"}`}
      >
        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(value)}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-widest text-[#c9a84c]/50">
        {count} venda{count === 1 ? "" : "s"}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/60 to-transparent" />
    </div>
  );
}

function Podium({ title, rows }: { title: string; rows: { name: string; total: number; qtd: number }[] }) {
  return (
    <div className="rounded-lg border border-[#c9a84c]/20 bg-[#111]/80 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#c9a84c]/15">
        <h3
          style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
          className="text-xl text-[#f0d78c]"
        >
          {title.toUpperCase()}
        </h3>
        <span className="text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/60">mês</span>
      </div>
      <ul className="divide-y divide-[#c9a84c]/8">
        {rows.length === 0 && (
          <li className="px-4 py-8 text-center text-xs uppercase tracking-widest text-[#c9a84c]/40">sem dados</li>
        )}
        {rows.map((r, i) => (
          <li key={r.name + i} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-3">
            <span
              style={{ fontFamily: '"Bebas Neue", sans-serif' }}
              className={`w-8 h-8 grid place-items-center rounded text-lg ${
                i === 0
                  ? "bg-gradient-to-br from-[#f0d78c] to-[#c9a84c] text-black"
                  : i === 1
                  ? "bg-[#3a3a3a] text-[#f0d78c] border border-[#c9a84c]/40"
                  : i === 2
                  ? "bg-[#2a1f0a] text-[#c9a84c] border border-[#c9a84c]/40"
                  : "bg-[#1a1a1a] text-[#c9a84c]/70 border border-[#c9a84c]/15"
              }`}
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0">
              <div className="font-semibold text-white truncate">{r.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/50">{r.qtd} venda(s)</div>
            </div>
            <div
              style={{ fontFamily: '"Bebas Neue", sans-serif' }}
              className="text-xl text-[#f0d78c] tabular-nums"
            >
              {formatCurrency(r.total)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}