import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { Maximize2, Minimize2, Volume2, VolumeX, ArrowUpRight, Megaphone, Bell, Coins } from "lucide-react";
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
  created_by: string | null;
};

function startOfDay() { const d = new Date(); d.setHours(0,0,0,0); return d; }
function startOfWeek() { const d = startOfDay(); d.setDate(d.getDate() - d.getDay()); return d; }
function startOfMonth() { const d = startOfDay(); d.setDate(1); return d; }

// ============ SOM ============
type SoundId = "buzina" | "caixa" | "sino";

function getCtx(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    return new AC();
  } catch { return null; }
}

// Buzina de caminhão / air horn — dois osciladores sawtooth detuned + ataque agressivo
function playBuzina(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);

  const blast = (t: number, dur: number, base: number) => {
    [base, base * 1.005, base * 0.5].forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(f, now + t);
      // leve vibrato no fim
      osc.frequency.linearRampToValueAtTime(f * 0.98, now + t + dur);
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(idx === 2 ? 0.4 : 0.55, now + t + 0.04);
      g.gain.setValueAtTime(idx === 2 ? 0.4 : 0.55, now + t + dur - 0.08);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + dur);
      osc.connect(g).connect(master);
      osc.start(now + t);
      osc.stop(now + t + dur + 0.05);
    });
  };
  // duas buzinadas (HOOONK HOOONK)
  blast(0, 0.45, 196);  // G3
  blast(0.55, 0.7, 196);
  setTimeout(() => ctx.close(), 1600);
}

// Caixa registradora — "cha-ching" com bell + click
function playCaixa(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);

  // click (ding inicial)
  const click = ctx.createOscillator();
  const clickG = ctx.createGain();
  click.type = "triangle";
  click.frequency.value = 1800;
  clickG.gain.setValueAtTime(0.0001, now);
  clickG.gain.exponentialRampToValueAtTime(0.4, now + 0.005);
  clickG.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  click.connect(clickG).connect(master);
  click.start(now); click.stop(now + 0.1);

  // bell — duas notas (cha-ching)
  const bell = (t: number, f: number) => {
    [f, f * 2, f * 3].forEach((freq, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.3 / (i + 1), now + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.6);
      o.connect(g).connect(master);
      o.start(now + t); o.stop(now + t + 0.65);
    });
  };
  bell(0.05, 880);   // chá
  bell(0.22, 1175);  // ching
  setTimeout(() => ctx.close(), 1500);
}

// Sino de vitória — arpejo C-E-G-C ascendente
function playSino(ctx: AudioContext) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5;
  master.connect(ctx.destination);
  const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
  notes.forEach((f, i) => {
    const t = i * 0.11;
    [f, f * 2].forEach((freq, h) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(0.35 / (h + 1), now + t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.8);
      o.connect(g).connect(master);
      o.start(now + t); o.stop(now + t + 0.85);
    });
  });
  setTimeout(() => ctx.close(), 1800);
}

function playSound(id: SoundId) {
  const ctx = getCtx();
  if (!ctx) return;
  if (id === "buzina") playBuzina(ctx);
  else if (id === "caixa") playCaixa(ctx);
  else playSino(ctx);
}

// Confetti dourado, mais intenso
function fireConfetti() {
  const end = Date.now() + 2200;
  const gold = ["#f0d78c", "#c9a84c", "#a07d2a", "#ffffff", "#fff7d6"];
  (function frame() {
    confetti({ particleCount: 8, angle: 60, spread: 80, startVelocity: 55, origin: { x: 0, y: 0.8 }, colors: gold });
    confetti({ particleCount: 8, angle: 120, spread: 80, startVelocity: 55, origin: { x: 1, y: 0.8 }, colors: gold });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  // burst central
  setTimeout(() => {
    confetti({ particleCount: 120, spread: 100, startVelocity: 45, origin: { x: 0.5, y: 0.4 }, colors: gold, scalar: 1.2 });
  }, 100);
}

// Hook count-up
function useCountUp(target: number, duration = 900, replayKey: number = 0) {
  const [val, setVal] = useState(target);
  const fromRef = useRef(target);
  useEffect(() => {
    // Em replay, reanima a partir de 0 mesmo que o alvo não tenha mudado
    if (replayKey > 0) fromRef.current = 0;
    const from = fromRef.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration, replayKey]);
  return val;
}

function Telao() {
  const qc = useQueryClient();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundId, setSoundId] = useState<SoundId>("buzina");
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const [pulseHero, setPulseHero] = useState(false);
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
        .select("id,total_amount,created_at,sale_date,seller_id,producer_id,customer_id,payment_method,created_by")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
    refetchInterval: 15000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 0,
  });

  const customersQ = useQuery({
    queryKey: ["telao-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name")).data ?? [],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });
  const sellersQ = useQuery({
    queryKey: ["telao-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name,user_id")).data ?? [],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });
  const producersQ = useQuery({
    queryKey: ["telao-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name,user_id")).data ?? [],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });
  const profilesQ = useQuery({
    queryKey: ["telao-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
    refetchInterval: 60000,
    refetchIntervalInBackground: true,
  });

  const sales = salesQ.data ?? [];
  const customers = customersQ.data ?? [];
  const sellers = sellersQ.data ?? [];
  const producers = producersQ.data ?? [];
  const profiles = profilesQ.data ?? [];

  // Fallback: se a venda não tem seller_id/producer_id, usa created_by
  // tentando primeiro casar com sellers/producers via user_id, senão profile.
  const effectiveSellerKey = (s: SaleRow): { id: string; name: string } | null => {
    if (s.seller_id) {
      return { id: s.seller_id, name: sellers.find((x: any) => x.id === s.seller_id)?.name ?? "Vendedor" };
    }
    if (s.created_by) {
      const seller = sellers.find((x: any) => x.user_id === s.created_by);
      if (seller) return { id: seller.id, name: seller.name };
      const prof = profiles.find((p: any) => p.id === s.created_by);
      return { id: s.created_by, name: prof?.full_name || prof?.email || "Vendedor" };
    }
    return null;
  };

  const effectiveProducerKey = (s: SaleRow): { id: string; name: string } | null => {
    if (s.producer_id) {
      return { id: s.producer_id, name: producers.find((x: any) => x.id === s.producer_id)?.name ?? "Produtor" };
    }
    if (s.created_by) {
      const producer = producers.find((x: any) => x.user_id === s.created_by);
      if (producer) return { id: producer.id, name: producer.name };
    }
    return null;
  };

  const cName = (id: string) => customers.find((c: any) => c.id === id)?.name ?? "Cliente";
  const sName = (id: string | null) => sellers.find((s: any) => s.id === id)?.name ?? "—";
  const pName = (id: string | null) => producers.find((p: any) => p.id === id)?.name ?? "—";

  const today0 = startOfDay();
  const week0 = startOfWeek();
  const month0 = startOfMonth();

  // Dedup por ID (proteção contra qualquer duplicação vinda do realtime/refetch)
  const uniqueSales = useMemo(() => {
    const seen = new Set<string>();
    const out: SaleRow[] = [];
    for (const s of sales) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [sales]);

  const todaySales = uniqueSales.filter((s) => new Date(s.created_at) >= today0);
  const weekSales = uniqueSales.filter((s) => new Date(s.created_at) >= week0);
  const monthSales = uniqueSales.filter((s) => new Date(s.created_at) >= month0);

  // Limite configurável: abaixo disso, duplica visualmente para preencher o loop
  const LOOP_DUPLICATE_THRESHOLD = 10;

  const sum = (arr: SaleRow[]) => arr.reduce((a, s) => a + Number(s.total_amount || 0), 0);

  // Ranking vendedores e produtores no mês (com fallback p/ created_by)
  const rankBy = (resolver: (s: SaleRow) => { id: string; name: string } | null) => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    monthSales.forEach((s) => {
      const r = resolver(s);
      if (!r) return;
      const cur = map.get(r.id) ?? { name: r.name, total: 0, qtd: 0 };
      cur.total += Number(s.total_amount || 0);
      cur.qtd += 1;
      map.set(r.id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.total - a.total).slice(0, 5);
  };

  const topSellers = rankBy(effectiveSellerKey);
  const topProducers = rankBy(effectiveProducerKey);

  // Realtime: nova venda → confetti + buzina + flash
  useEffect(() => {
    const channel = supabase
      .channel("telao-sales")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, () => {
        qc.invalidateQueries({ queryKey: ["telao-sales"] });
        fireConfetti();
        if (soundEnabled) playSound(soundId);
        setFlash(true);
        setPulseHero(true);
        setTimeout(() => setFlash(false), 1800);
        setTimeout(() => setPulseHero(false), 2000);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, soundEnabled, soundId]);

  // Detecta crescimento por polling como fallback
  useEffect(() => {
    if (lastCount !== null && todaySales.length > lastCount) {
      fireConfetti();
      if (soundEnabled) playSound(soundId);
      setFlash(true);
      setPulseHero(true);
      setTimeout(() => setFlash(false), 1800);
      setTimeout(() => setPulseHero(false), 2000);
    }
    setLastCount(todaySales.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaySales.length]);

  // Auto-scroll loop nas vendas do dia (reinicia a cada rotação)
  const [rotateTick, setRotateTick] = useState(0);

  const now = new Date();

  const totalHoje = sum(todaySales);
  const totalSemana = sum(weekSales);
  const totalMes = sum(monthSales);
  const ticketMedio = todaySales.length ? totalHoje / todaySales.length : 0;
  const [heroBeat, setHeroBeat] = useState(0);
  const heroVal = useCountUp(totalHoje, 900, heroBeat);
  const ticketVal = useCountUp(ticketMedio, 900, heroBeat);
  const opVal = useCountUp(todaySales.length, 900, heroBeat);

  // Loop 30s — realça e reconta os números do topo
  useEffect(() => {
    const i = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["telao-sales"] });
      setHeroBeat((n) => n + 1);
      setPulseHero(true);
      setTimeout(() => setPulseHero(false), 1600);
    }, 30000);
    return () => clearInterval(i);
  }, [qc]);

  // Loop 60s — rotaciona janela das vendas do dia (marquee de dados)
  useEffect(() => {
    const i = setInterval(() => {
      qc.invalidateQueries({ queryKey: ["telao-sales"] });
      setRotateTick((n) => n + 1);
    }, 60000);
    return () => clearInterval(i);
  }, [qc]);

  // últimos 12 para marquee horizontal
  const marqueeSales = useMemo(() => todaySales.slice(0, 12), [todaySales]);

  // Janela rotativa para a lista inferior (troca a cada 60s)
  const WINDOW = 8;
  const rotatedSales = useMemo(() => {
    if (todaySales.length <= WINDOW) return todaySales;
    const start = (rotateTick * WINDOW) % todaySales.length;
    const out: SaleRow[] = [];
    for (let i = 0; i < WINDOW; i++) {
      out.push(todaySales[(start + i) % todaySales.length]);
    }
    return out;
  }, [todaySales, rotateTick]);

  const loopedSales = useMemo(() => {
    if (rotatedSales.length === 0) return [];
    // Só duplica visualmente quando há POUCOS itens (para preencher o loop).
    // Com itens suficientes, mostra cada venda uma única vez.
    if (rotatedSales.length >= LOOP_DUPLICATE_THRESHOLD) return rotatedSales;
    return [...rotatedSales, ...rotatedSales];
  }, [rotatedSales, LOOP_DUPLICATE_THRESHOLD]);

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
      {/* keyframes locais */}
      <style>{`
        @keyframes telao-pulse-gold { 0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); } 50% { box-shadow: 0 0 80px 8px rgba(240,215,140,0.45); } }
        @keyframes telao-scroll-x { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
        @keyframes telao-scroll-y { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,-50%,0); } }
        @keyframes telao-shine { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        @keyframes telao-pop { 0% { transform: scale(0.85); opacity: 0; } 60% { transform: scale(1.05); opacity: 1; } 100% { transform: scale(1); } }
        @keyframes telao-rotate-in { 0% { opacity: 0; transform: translateY(14px); filter: blur(4px); } 100% { opacity: 1; transform: translateY(0); filter: blur(0); } }
        .telao-pulse { animation: telao-pulse-gold 1.8s ease-out 1; }
        .telao-marquee { display: inline-flex; animation: telao-scroll-x 40s linear infinite; will-change: transform; backface-visibility: hidden; }
        .telao-marquee:hover { animation-play-state: paused; }
        .telao-marquee-track { display: inline-flex; min-width: 200%; }
        .telao-sales-loop { animation: telao-rotate-in 0.7s ease-out 1, telao-scroll-y 26s linear infinite; will-change: transform; backface-visibility: hidden; }
        .telao-sales-loop:hover { animation-play-state: paused; }
        @media (max-width: 768px) { .telao-marquee { animation-duration: 25s; } }
        @media (prefers-reduced-motion: reduce) { .telao-marquee, .telao-sales-loop { animation: none; } }
        .telao-shine { background-image: linear-gradient(90deg, #f0d78c 0%, #ffffff 50%, #f0d78c 100%); background-size: 200% 100%; background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: telao-shine 4s linear infinite; }
        .telao-pop { animation: telao-pop 0.5s cubic-bezier(.34,1.56,.64,1) 1; }
        .telao-rotate { animation: telao-rotate-in 0.7s ease-out 1; }
        .telao-flash-row { animation: telao-pop 0.6s ease-out 1; box-shadow: inset 0 0 0 1px rgba(240,215,140,0.5); }
      `}</style>

      {/* MARQUEE TOP — últimas vendas rolando */}
      {marqueeSales.length > 0 && (
        <div
          className="mb-4 -mx-6 px-0 py-3 border-y border-[#c9a84c]/15 bg-black/40 overflow-hidden relative"
          style={{
            maskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
            WebkitMaskImage:
              "linear-gradient(to right, transparent, #000 6%, #000 94%, transparent)",
          }}
        >
          <div className="telao-marquee whitespace-nowrap text-sm">
            {(marqueeSales.length < LOOP_DUPLICATE_THRESHOLD ? [...marqueeSales, ...marqueeSales] : marqueeSales).map((s, i) => (
              <span key={`${s.id}-mq-${i}`} className="inline-flex items-center gap-3 px-6 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />
                <span className="uppercase tracking-widest text-[#c9a84c]/70 text-xs">{fmtTime(s.created_at)}</span>
                <span className="text-white font-semibold">{cName(s.customer_id)}</span>
                <span className="text-[#c9a84c]/50">·</span>
                <span className="text-[#f0d78c] font-bold tabular-nums">{formatCurrency(Number(s.total_amount || 0))}</span>
              </span>
            ))}
          </div>
        </div>
      )}

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
        <div className="flex items-center gap-2">
          <div
            style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
            className="hidden md:block text-4xl tabular-nums mr-2 telao-shine"
          >
            {clock}
          </div>
          {/* Picker de som */}
          <div className="flex items-center rounded border border-[#c9a84c]/30 bg-[#1a1a1a] overflow-hidden">
            {([
              { id: "buzina", icon: Megaphone, label: "Buzina" },
              { id: "caixa", icon: Coins, label: "Caixa" },
              { id: "sino", icon: Bell, label: "Sino" },
            ] as { id: SoundId; icon: any; label: string }[]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { setSoundId(id); if (soundEnabled) playSound(id); }}
                title={label}
                className={`h-10 w-10 grid place-items-center transition ${soundId === id ? "bg-[#c9a84c] text-black" : "text-[#c9a84c] hover:bg-[#c9a84c]/10"}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button
            onClick={() => { setSoundEnabled((v) => !v); if (!soundEnabled) playSound(soundId); }}
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
          className={`col-span-12 lg:col-span-6 row-span-2 relative overflow-hidden rounded-lg p-8 border border-[#c9a84c]/30 ${pulseHero ? "telao-pulse" : ""}`}
          style={{
            background:
              "linear-gradient(135deg, #1a1a1a 0%, #0d0d0d 60%, #1a1a1a 100%)",
          }}
        >
          <div
            className="absolute -top-32 -right-32 w-96 h-96 rounded-full opacity-30 blur-3xl animate-pulse"
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
              className="text-[clamp(3.5rem,9vw,8rem)] leading-none tabular-nums telao-shine"
            >
              {formatCurrency(heroVal)}
            </div>
            <div className="mt-6 flex items-end justify-between border-t border-[#c9a84c]/15 pt-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/60">Operações</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-white tabular-nums">
                  {Math.round(opVal)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/60">Ticket médio</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-white tabular-nums">
                  {formatCurrency(ticketVal)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* SEMANA */}
        <KpiBlock label="Semana" value={totalSemana} count={weekSales.length} />
        {/* MÊS */}
        <KpiBlock label="Mês" value={totalMes} count={monthSales.length} accent />

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
          <div
            ref={scrollRef}
            className="h-[460px] overflow-hidden"
            style={{
              maskImage: todaySales.length ? "linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent)" : undefined,
              WebkitMaskImage: todaySales.length ? "linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent)" : undefined,
            }}
          >
            {todaySales.length === 0 && (
              <div className="h-full grid place-items-center text-[#c9a84c]/40 uppercase tracking-widest text-sm">
                Aguardando primeira venda
              </div>
            )}
            <ul key={`rot-${rotateTick}-${rotatedSales.length}`} className="telao-sales-loop">
              {loopedSales.map((s, i) => {
                const name = cName(s.customer_id);
                const initial = (name?.[0] ?? "?").toUpperCase();
                const isFirst = i === 0 && pulseHero;
                return (
                  <li
                    key={`${s.id}-${i}`}
                    className={`grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 border-b border-[#c9a84c]/8 hover:bg-[#c9a84c]/5 transition ${isFirst ? "telao-flash-row bg-[#c9a84c]/10" : ""}`}
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
  const animated = useCountUp(value, 700);
  return (
    <div
      className={`col-span-6 lg:col-span-3 rounded-lg border p-5 relative overflow-hidden ${accent ? "border-[#c9a84c]/40 bg-gradient-to-br from-[#1a1a1a] to-[#0d0d0d]" : "border-[#c9a84c]/20 bg-[#111]"}`}
    >
      <div className="text-[10px] uppercase tracking-[0.35em] text-[#c9a84c]/70">{label}</div>
      <div
        style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.02em" }}
        className={`mt-3 text-4xl tabular-nums leading-none ${accent ? "text-[#f0d78c]" : "text-white"}`}
      >
        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(animated)}
      </div>
      <div className="mt-3 text-[11px] uppercase tracking-widest text-[#c9a84c]/50">
        {count} venda{count === 1 ? "" : "s"}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#c9a84c]/60 to-transparent animate-pulse" />
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