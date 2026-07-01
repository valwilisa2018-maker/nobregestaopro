import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/auth";
import { fmtDate, fmtTime } from "@/lib/format";
import { Maximize2, Minimize2, Volume2, VolumeX, ArrowUpRight, Megaphone, Bell, Coins, Pencil, X, Music } from "lucide-react";
import confetti from "canvas-confetti";
import { useCelebrationSettings, SoundId as SoundType } from "@/hooks/use-celebration-settings";
import { useBigSellerOverlaySeconds } from "@/hooks/use-telao-settings";
import caixaRegistradoraAsset from "@/assets/caixa-registradora.m4a.asset.json";

// Som fixo (áudio real) para recebimentos pendentes confirmados
let pendingReceiptAudio: HTMLAudioElement | null = null;
function playPendingReceiptSound(volume: number) {
  try {
    if (typeof window === "undefined") return;
    if (!pendingReceiptAudio) {
      pendingReceiptAudio = new Audio(caixaRegistradoraAsset.url);
      pendingReceiptAudio.preload = "auto";
    }
    pendingReceiptAudio.volume = Math.min(1, Math.max(0, volume));
    pendingReceiptAudio.currentTime = 0;
    void pendingReceiptAudio.play().catch(() => {});
  } catch {}
}

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
  payment_status: string | null;
  service_type_id: string | null;
  package_id: string | null;
  created_by: string | null;
};

// Sempre calcula "início do dia" no fuso America/Sao_Paulo,
// para que a virada de meia-noite siga o horário do Brasil
// independentemente do fuso do dispositivo/servidor.
const BR_TZ = "America/Sao_Paulo";
function nowInBrazil(): Date {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BR_TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value || 0);
  // Constrói uma Date local com os componentes de São Paulo
  return new Date(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"), g("second"));
}
function startOfDay() { const d = nowInBrazil(); d.setHours(0,0,0,0); return d; }
function startOfWeek() { const d = startOfDay(); d.setDate(d.getDate() - d.getDay()); return d; }
function startOfMonth() { const d = startOfDay(); d.setDate(1); return d; }

const VISIBLE_SALES_ROWS = 6;
const SALE_ROW_HEIGHT = 72;
const SALE_SCROLL_DURATION_PER_ROW = 3.2;

// ============ SOM ============
type SoundId = "buzina" | "caixa" | "sino" | "custom" | "run-vine" | "danger-alarm" | "nobre" | "gol-da-nobre";

function getCtx(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    return new AC();
  } catch { return null; }
}

// Limite máximo de duração de qualquer som do telão (segundos)
const MAX_SOUND_DURATION = 35;

// Mantém referência aos contextos/sources ativos para impedir sobreposição
const activeCtxs = new Set<AudioContext>();
let activeSource: AudioBufferSourceNode | null = null;
let sharedAudioCtx: AudioContext | null = null;

function getSharedAudioCtx(): AudioContext | null {
  try {
    if (sharedAudioCtx && sharedAudioCtx.state !== "closed") return sharedAudioCtx;
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    sharedAudioCtx = new AC();
    return sharedAudioCtx;
  } catch { return null; }
}

async function unlockAudio() {
  const ctx = getSharedAudioCtx();
  if (!ctx) return false;
  try {
    if (ctx.state === "suspended") await ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.03);
    return true;
  } catch {
    return false;
  }
}

function stopAllSounds() {
  if (activeSource) {
    try { activeSource.stop(0); } catch {}
    try { activeSource.disconnect(); } catch {}
    activeSource = null;
  }
  activeCtxs.forEach((c) => {
    if (c !== sharedAudioCtx) {
      try { c.close(); } catch {}
    }
  });
  activeCtxs.clear();
}

function registerCtx(ctx: AudioContext, lifeMs: number) {
  activeCtxs.add(ctx);
  const cap = Math.min(lifeMs, MAX_SOUND_DURATION * 1000);
  setTimeout(() => {
    if (ctx !== sharedAudioCtx) {
      try { ctx.close(); } catch {}
    }
    activeCtxs.delete(ctx);
  }, cap);
}

// Buzina de caminhão / air horn — dois osciladores sawtooth detuned + ataque agressivo
function playBuzina(ctx: AudioContext, vol = 1) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5 * vol;
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
  registerCtx(ctx, 1600);
}

// Caixa registradora — "cha-ching" com bell + click
function playCaixa(ctx: AudioContext, vol = 1) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.55 * vol;
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
  registerCtx(ctx, 1500);
}

// Sino de vitória — arpejo C-E-G-C ascendente
function playSino(ctx: AudioContext, vol = 1) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5 * vol;
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
  registerCtx(ctx, 1800);
}

async function playSound(id: SoundId, vol = 1, customUrl?: string) {
  // Interrompe qualquer som anterior — evita sobreposição de áudios
  stopAllSounds();
  const ctx = getSharedAudioCtx() ?? getCtx();
  if (!ctx) return;
  try { if (ctx.state === "suspended") await ctx.resume(); } catch {}
  
  let audioUrl = "";
  if (id === "custom" && customUrl) {
    audioUrl = customUrl;
  } else if (id === "run-vine") {
    audioUrl = "/run-vine-sound-effect.mp3";
  } else if (id === "danger-alarm") {
    audioUrl = "/danger-alarm.mp3";
  } else if (id === "nobre") {
    audioUrl = "/nobre.mp3";
  }
  else if (id === "gol-da-nobre") {
    audioUrl = "/gol-da-nobre.mp3";
  }

  if (audioUrl) {
    try {
      const response = await fetch(audioUrl);
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      const gainNode = ctx.createGain();
      gainNode.gain.value = vol;
      source.connect(gainNode);
      gainNode.connect(ctx.destination);
      // Limita a duração máxima a MAX_SOUND_DURATION segundos
      const playDur = Math.min(audioBuffer.duration, MAX_SOUND_DURATION);
      source.start(0, 0, playDur);
      activeSource = source;
      source.onended = () => { if (activeSource === source) activeSource = null; };
      registerCtx(ctx, playDur * 1000 + 200);
      return;
    } catch (err) {
      console.error("Erro ao tocar som customizado:", err);
      try { ctx.close(); } catch {}
    }
  }

  if (id === "buzina") playBuzina(ctx, vol);
  else if (id === "caixa") playCaixa(ctx, vol);
  else if (id === "sino") playSino(ctx, vol);
  else {
    // Nenhum mapeamento — fecha o contexto recém-criado
    try { ctx.close(); } catch {}
  }
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

function rememberRealtimeEventOnce(store: Set<string>, key: string, max = 500) {
  if (!key) return true;
  if (store.has(key)) return false;
  store.add(key);
  if (store.size > max) {
    const first = store.values().next().value;
    if (first) store.delete(first);
  }
  return true;
}

function rememberRecentPaymentEvent(store: Set<string>, saleId: string | undefined, amount: number | undefined) {
  if (!saleId) return true;
  const key = `${saleId}:${Number(amount || 0).toFixed(2)}`;
  if (store.has(key)) return false;
  store.add(key);
  window.setTimeout(() => store.delete(key), 15000);
  return true;
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
  const [celebration, setCelebration] = useCelebrationSettings();
  const [overlaySeconds] = useBigSellerOverlaySeconds();
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [audioReady, setAudioReady] = useState(false);
  const [soundId, setSoundId] = useState<SoundId>(celebration.soundId as SoundId);
  const [customSoundUrl, setCustomSoundUrl] = useState(celebration.customSoundUrl || "");
  const [lastCount, setLastCount] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const [kiosk, setKiosk] = useState(false);
  const [pulseHero, setPulseHero] = useState(false);
  const [bigSeller, setBigSeller] = useState<{ name: string; amount: number } | null>(null);
  const bigSellerTimer = useRef<number | null>(null);
  const showBigSeller = (name: string, amount: number) => {
    setBigSeller({ name: name || "Vendedor", amount: Number(amount) || 0 });
    if (bigSellerTimer.current) window.clearTimeout(bigSellerTimer.current);
    bigSellerTimer.current = window.setTimeout(() => setBigSeller(null), overlaySeconds * 1000);
  };
  const [bigReceipt, setBigReceipt] = useState<{ name: string; amount: number } | null>(null);
  const bigReceiptTimer = useRef<number | null>(null);
  const processedReceiptIdsRef = useRef<Set<string>>(new Set());
  const processedPaymentUpdateKeysRef = useRef<Set<string>>(new Set());
  const recentPaymentEventKeysRef = useRef<Set<string>>(new Set());
  const [pendenteFlash, setPendenteFlash] = useState(false);
  const showBigReceipt = (name: string, amount: number) => {
    setBigReceipt({ name: name || "Produtor", amount: Number(amount) || 0 });
    if (bigReceiptTimer.current) window.clearTimeout(bigReceiptTimer.current);
    bigReceiptTimer.current = window.setTimeout(() => setBigReceipt(null), overlaySeconds * 1000);
    setPendenteFlash(true);
    window.setTimeout(() => setPendenteFlash(false), 2000);
  };
  const rootRef = useRef<HTMLDivElement>(null);
  const enableSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    setCelebration({ soundEnabled: next });
    if (next) {
      const ok = await unlockAudio();
      setAudioReady(ok);
      await playSound("caixa", Math.max(0.45, (celebration.volume || 80) / 100));
    } else {
      setAudioReady(false);
      stopAllSounds();
    }
  };
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
        .select("id,total_amount,paid_amount,created_at,sale_date,seller_id,producer_id,customer_id,payment_method,payment_status,service_type_id,package_id,created_by")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SaleRow[];
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 30_000,
  });

  const customersQ = useQuery({
    queryKey: ["telao-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name")).data ?? [],
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });
  const sellersQ = useQuery({
    queryKey: ["telao-sellers"],
    queryFn: async () => (await supabase.from("sellers").select("id,name,user_id")).data ?? [],
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });
  const producersQ = useQuery({
    queryKey: ["telao-producers"],
    queryFn: async () => (await supabase.from("producers").select("id,name,user_id")).data ?? [],
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });
  const profilesQ = useQuery({
    queryKey: ["telao-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id,full_name,email")).data ?? [],
    refetchInterval: 300000,
    refetchIntervalInBackground: false,
  });
  const serviceTypesQ = useQuery({
    queryKey: ["telao-service-types"],
    queryFn: async () => (await supabase.from("service_types").select("id,name")).data ?? [],
    refetchInterval: 600000,
    refetchIntervalInBackground: false,
  });
  const packagesQ = useQuery({
    queryKey: ["telao-packages"],
    queryFn: async () => (await supabase.from("packages").select("id,name")).data ?? [],
    refetchInterval: 600000,
    refetchIntervalInBackground: false,
  });
  const serviceOrdersQ = useQuery({
    queryKey: ["telao-service-orders"],
    queryFn: async () =>
      (
        await supabase
          .from("service_orders")
          .select("id,sale_id,delivered_at,column_id,created_at")
          .order("created_at", { ascending: false })
          .limit(2000)
      ).data ?? [],
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  });
  const kanbanColumnsQ = useQuery({
    queryKey: ["telao-kanban-columns"],
    queryFn: async () => (await supabase.from("kanban_columns").select("id,is_done")).data ?? [],
    refetchInterval: 600000,
    refetchIntervalInBackground: false,
  });

  const receiptsQ = useQuery({
    queryKey: ["telao-sale-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_receipts")
        .select("id,sale_id,amount,paid_at,created_at,notes")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });

  const sales = salesQ.data ?? [];
  const customers = customersQ.data ?? [];
  const sellers = sellersQ.data ?? [];
  const producers = producersQ.data ?? [];
  const profiles = profilesQ.data ?? [];
  const serviceTypes = serviceTypesQ.data ?? [];
  const packagesList = packagesQ.data ?? [];
  const serviceOrders = serviceOrdersQ.data ?? [];
  const kanbanColumns = kanbanColumnsQ.data ?? [];

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

  const serviceName = (s: SaleRow) => {
    if (s.package_id) {
      return packagesList.find((p: any) => p.id === s.package_id)?.name ?? "Pacote";
    }
    if (s.service_type_id) {
      return serviceTypes.find((t: any) => t.id === s.service_type_id)?.name ?? "Serviço";
    }
    return "Serviço";
  };

  // Resolve nome do vendedor com fallback p/ created_by (mesma lógica de effectiveSellerKey)
  const sellerNameOf = (s: SaleRow) => effectiveSellerKey(s)?.name ?? "—";
  const producerNameOf = (s: SaleRow) => effectiveProducerKey(s)?.name ?? "—";

  // Edição inline de venda (vendedor / produtor)
  const [editing, setEditing] = useState<SaleRow | null>(null);
  const [editSeller, setEditSeller] = useState<string>("");
  const [editProducer, setEditProducer] = useState<string>("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [newProducerName, setNewProducerName] = useState<string>("");
  const openEdit = (s: SaleRow) => {
    setEditing(s);
    setEditSeller(s.seller_id ?? "");
    setEditProducer(s.producer_id ?? "");
    setNewProducerName("");
  };
  const closeEdit = () => { if (!savingEdit) setEditing(null); };
  const saveEdit = async () => {
    if (!editing) return;
    setSavingEdit(true);
    let producerIdToSave: string | null = editProducer || null;
    const trimmedNew = newProducerName.trim();
    if (trimmedNew) {
      const { data: created, error: createErr } = await supabase
        .from("producers")
        .insert({ name: trimmedNew })
        .select("id,name,user_id")
        .single();
      if (createErr) {
        setSavingEdit(false);
        alert("Erro ao criar produtor: " + createErr.message);
        return;
      }
      producerIdToSave = created.id;
      qc.invalidateQueries({ queryKey: ["telao-producers"] });
    }
    const { error } = await supabase
      .from("sales")
      .update({
        seller_id: editSeller || null,
        producer_id: producerIdToSave,
      })
      .eq("id", editing.id);
    setSavingEdit(false);
    if (!error) {
      qc.invalidateQueries({ queryKey: ["telao-sales"] });
      setEditing(null);
    } else {
      alert("Erro ao salvar: " + error.message);
    }
  };

  const paymentStatusLabel = (status: string | null | undefined) => {
    switch ((status || "").toLowerCase()) {
      case "pago": return { label: "Pago", color: "#34d399", bg: "rgba(52,211,153,0.12)" };
      case "parcial": return { label: "Parcial", color: "#fbbf24", bg: "rgba(251,191,36,0.12)" };
      case "pendente": return { label: "Pendente", color: "#f87171", bg: "rgba(248,113,113,0.12)" };
      case "cancelado": return { label: "Cancelado", color: "#a3a3a3", bg: "rgba(163,163,163,0.12)" };
      default: return { label: status || "—", color: "#c9a84c", bg: "rgba(201,168,76,0.12)" };
    }
  };

  // Tick a cada 30s para detectar virada de dia/semana/mês e zerar contadores
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  const today0 = useMemo(() => startOfDay(), [nowTick]);
  const week0 = useMemo(() => startOfWeek(), [nowTick]);
  const month0 = useMemo(() => startOfMonth(), [nowTick]);

  // Filtro de período (mês/ano) para "Vídeos Prontos"
  const _nowForVideos = new Date();
  const [videosMonth, setVideosMonth] = useState<number>(_nowForVideos.getMonth()); // 0-11
  const [videosYear, setVideosYear] = useState<number>(_nowForVideos.getFullYear());
  const videosPeriodStart = useMemo(
    () => new Date(videosYear, videosMonth, 1, 0, 0, 0, 0),
    [videosYear, videosMonth],
  );
  const videosPeriodEnd = useMemo(
    () => new Date(videosYear, videosMonth + 1, 1, 0, 0, 0, 0),
    [videosYear, videosMonth],
  );

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

  const todaySales = uniqueSales.filter((s) => {
    const date = new Date(s.created_at);
    return date >= today0;
  });
  const weekSales = uniqueSales.filter((s) => {
    const date = s.sale_date ? new Date(s.sale_date + 'T12:00:00') : new Date(s.created_at);
    return date >= week0;
  });
  const monthSales = uniqueSales.filter((s) => {
    const date = s.sale_date ? new Date(s.sale_date + 'T12:00:00') : new Date(s.created_at);
    return date >= month0;
  });

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

  // Vídeos prontos por produtor (mês) — service_orders entregues ou em coluna "concluído"
  const doneColumnIds = useMemo(
    () => new Set(kanbanColumns.filter((c: any) => c.is_done).map((c: any) => c.id)),
    [kanbanColumns],
  );
  const videosByProducer = useMemo(() => {
    const salesById = new Map(uniqueSales.map((s) => [s.id, s]));
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    for (const so of serviceOrders as any[]) {
      const isDone = !!so.delivered_at || doneColumnIds.has(so.column_id);
      if (!isDone) continue;
      const ref = so.delivered_at ?? so.created_at;
      if (!ref) continue;
      const refDate = new Date(ref);
      if (refDate < videosPeriodStart || refDate >= videosPeriodEnd) continue;
      const sale = so.sale_id ? salesById.get(so.sale_id) : undefined;
      if (!sale) continue;
      const r = effectiveProducerKey(sale);
      if (!r) continue;
      const cur = map.get(r.id) ?? { name: r.name, total: 0, qtd: 0 };
      cur.qtd += 1;
      map.set(r.id, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  }, [serviceOrders, doneColumnIds, uniqueSales, producers, profiles, videosPeriodStart, videosPeriodEnd]);

  const videosTotalPeriod = useMemo(
    () => videosByProducer.reduce((a, r) => a + r.qtd, 0),
    [videosByProducer],
  );

  // Realtime: nova venda → confetti + buzina + flash; também escuta UPDATE/DELETE para refletir mudanças
  useEffect(() => {
    const channel = supabase
      .channel("telao-sales")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sales" }, (payload: any) => {
        qc.invalidateQueries({ queryKey: ["telao-sales"] });
        qc.invalidateQueries({ queryKey: ["telao-sinal-hoje"] });
        if (celebration.confettiEnabled) fireConfetti();
        if (soundEnabled && celebration.soundEnabled) playSound(soundId, celebration.volume / 100);
        setFlash(true);
        setPulseHero(true);
        setTimeout(() => setFlash(false), 1800);
        setTimeout(() => setPulseHero(false), 2000);
        const row = payload?.new as SaleRow | undefined;
        if (row) showBigSeller(sellerNameOf(row), Number(row.total_amount || 0));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sales" }, (payload: any) => {
        qc.invalidateQueries({ queryKey: ["telao-sales"] });
        qc.invalidateQueries({ queryKey: ["telao-sinal-hoje"] });
        qc.invalidateQueries({ queryKey: ["telao-sale-receipts"] });

        const next = payload?.new as SaleRow & { paid_amount?: number } | undefined;
        const prev = payload?.old as (SaleRow & { paid_amount?: number }) | undefined;
        if (!next?.id) return;

        const paidBefore = Number(prev?.paid_amount ?? 0);
        const paidAfter = Number(next.paid_amount ?? 0);
        const diff = paidAfter - paidBefore;
        if (diff <= 0.009) return;

        const saleRef = next.sale_date ? new Date(`${next.sale_date}T12:00:00`) : new Date(next.created_at);
        const isOlderPendingReceipt = saleRef < today0;
        if (!isOlderPendingReceipt) return;

        const key = `sale-paid-update:${next.id}:${paidBefore.toFixed(2)}:${paidAfter.toFixed(2)}`;
        if (!rememberRealtimeEventOnce(processedPaymentUpdateKeysRef.current, key)) return;
        if (!rememberRecentPaymentEvent(recentPaymentEventKeysRef.current, next.id, diff)) return;

        const name = producerNameOf(next) !== "—" ? producerNameOf(next) : cName(next.customer_id);
        if (celebration.confettiEnabled) fireConfetti();
        playPendingReceiptSound(Math.max(0.5, (celebration.volume || 80) / 100));
        showBigReceipt(name, diff);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "sales" }, () => {
        qc.invalidateQueries({ queryKey: ["telao-sales"] });
        qc.invalidateQueries({ queryKey: ["telao-sinal-hoje"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [qc, soundEnabled, soundId, celebration.soundEnabled, celebration.confettiEnabled, celebration.volume, today0, producers, customers, profiles]);

  // Realtime: novo recebimento (sale_receipts INSERT) → overlay com produtor + valor recebido
  useEffect(() => {
    const processedReceiptIds = processedReceiptIdsRef.current;
    const channel = supabase
      .channel("telao-sale-receipts")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "sale_receipts" }, async (payload: any) => {
        qc.invalidateQueries({ queryKey: ["telao-sale-receipts"] });
        const row = payload?.new as { id?: string; sale_id?: string; amount?: number; notes?: string } | undefined;
        if (!row?.sale_id) return;
        // Trava de idempotência: cada recebimento dispara som/overlay uma única vez.
        if (row.id && !rememberRealtimeEventOnce(processedReceiptIds, `receipt:${row.id}`)) return;
        // Sinal inicial (na criação da venda) NÃO dispara overlay de "valor recebido" —
        // já é celebrado pelo overlay de nova venda (bigSeller).
        if ((row.notes || "").toLowerCase().includes("comprovante inicial")) return;
        if (!rememberRecentPaymentEvent(recentPaymentEventKeysRef.current, row.sale_id, Number(row.amount || 0))) return;
        let sale = uniqueSales.find((s) => s.id === row.sale_id);
        if (!sale) {
          const { data } = await supabase
            .from("sales")
            .select("id,total_amount,created_at,sale_date,seller_id,producer_id,customer_id,payment_method,payment_status,service_type_id,package_id,created_by")
            .eq("id", row.sale_id)
            .maybeSingle();
          if (data) sale = data as SaleRow;
        }
        // Observação: recebimentos do mesmo dia da venda também disparam o overlay do produtor.
        // O "Comprovante inicial" já é filtrado acima para não duplicar com o overlay de nova venda.
        const name = sale ? (producerNameOf(sale) !== "—" ? producerNameOf(sale) : cName(sale.customer_id)) : "Produtor";
        if (celebration.confettiEnabled) fireConfetti();
        // Som fixo de "caixa registradora" (áudio real) toda vez que um recebimento é confirmado.
        // Independente do som escolhido para novas vendas.
        playPendingReceiptSound(Math.max(0.5, (celebration.volume || 80) / 100));
        showBigReceipt(name, Number(row.amount || 0));
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, uniqueSales, producers, profiles, customers, soundEnabled, soundId, celebration]);

  // Detecta crescimento por polling como fallback
  useEffect(() => {
    if (lastCount !== null && todaySales.length > lastCount) {
      if (celebration.confettiEnabled) fireConfetti();
      if (soundEnabled || celebration.soundEnabled) {
        playSound(
          (celebration.soundId as SoundId) || soundId, 
          (celebration.volume / 100) || 0.7,
          celebration.customSoundUrl || customSoundUrl
        );
      }
      setFlash(true);
      setPulseHero(true);
      setTimeout(() => setFlash(false), 1800);
      setTimeout(() => setPulseHero(false), 2000);
      const newest = todaySales[0];
      if (newest) showBigSeller(sellerNameOf(newest), Number(newest.total_amount || 0));
    }
    setLastCount(todaySales.length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todaySales.length, soundEnabled, soundId, celebration, customSoundUrl]);

  const now = new Date();

  const totalHoje = sum(todaySales);
  const totalSemana = sum(weekSales);
  const totalMes = sum(monthSales);
  const ticketMedio = todaySales.length ? totalHoje / todaySales.length : 0;

  // Fonte de verdade (backend): v_daily_financials.sinal = Σ sales.paid_amount do dia.
  // Nunca depende de notes em sale_receipts.
  const receipts = receiptsQ.data ?? [];
  const todaySaleIds = useMemo(() => new Set(todaySales.map((s: any) => s.id)), [todaySales]);
  const todayReceipts = useMemo(() => {
    return receipts.filter((r: any) => {
      const ref = r.paid_at ? new Date(r.paid_at + (r.paid_at.length === 10 ? "T12:00:00" : "")) : new Date(r.created_at);
      return ref >= today0;
    });
  }, [receipts, today0]);
  const todayISO = useMemo(() => {
    // Data de hoje no fuso America/Sao_Paulo (bate com a view v_daily_financials)
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric", month: "2-digit", day: "2-digit",
    }).format(new Date());
    return parts; // YYYY-MM-DD
  }, []);
  const sinalHojeQ = useQuery({
    queryKey: ["telao-sinal-hoje", todayISO],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("v_daily_financials")
        .select("sinal")
        .eq("dia", todayISO)
        .maybeSingle();
      if (error) throw error;
      return Number(data?.sinal ?? 0);
    },
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    staleTime: 30_000,
  });
  // Sinal · Hoje = soma do paid_amount de TODAS as vendas criadas hoje
  // (cobre parcial e total, mesmo sem comprovante anexado).
  // Receb. pendentes · Hoje = recebimentos lançados hoje que NÃO são o sinal inicial
  // da venda de hoje (evita dupla contagem).
  const isInitial = (r: any) => (r.notes || "").toLowerCase().includes("comprovante inicial");
  const totalSinalHoje = useMemo(
    () => todaySales.reduce((a: number, s: any) => a + Number(s.paid_amount || 0), 0),
    [todaySales],
  );
  const totalPendenteHoje = useMemo(
    () => todayReceipts
      .filter((r: any) => !(todaySaleIds.has(r.sale_id) && isInitial(r)))
      .reduce((a: number, r: any) => a + Number(r.amount || 0), 0),
    [todayReceipts, todaySaleIds],
  );

  const [heroBeat, setHeroBeat] = useState(0);
  const heroVal = useCountUp(totalHoje, 900, heroBeat);
  const ticketVal = useCountUp(ticketMedio, 900, heroBeat);
  const opVal = useCountUp(todaySales.length, 900, heroBeat);
  const sinalVal = useCountUp(totalSinalHoje, 900, heroBeat);
  const pendenteVal = useCountUp(totalPendenteHoje, 900, heroBeat);

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

  // últimos 12 para marquee horizontal (sem repetição: usa apenas vendas únicas)
  const marqueeSales = useMemo(() => todaySales.slice(0, 12), [todaySales]);

  // Lista única do loop principal — TODAS as vendas do dia, sem repetir nem pular
  const loopSales = useMemo(() => todaySales, [todaySales]);

  const shouldAnimateSales = loopSales.length > 1;
  const salesLoopDuration = Math.max(18, loopSales.length * SALE_SCROLL_DURATION_PER_ROW);

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
        @keyframes telao-big-in { 0% { opacity: 0; transform: scale(0.4) rotate(-6deg); filter: blur(12px); } 60% { opacity: 1; transform: scale(1.08) rotate(2deg); filter: blur(0); } 100% { opacity: 1; transform: scale(1) rotate(0); } }
        @keyframes telao-big-glow { 0%,100% { text-shadow: 0 0 30px rgba(240,215,140,0.6), 0 0 80px rgba(201,168,76,0.4); } 50% { text-shadow: 0 0 60px rgba(240,215,140,1), 0 0 140px rgba(201,168,76,0.9); } }
        @keyframes telao-sub-bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
        .telao-pulse { animation: telao-pulse-gold 1.8s ease-out 1; }
        .telao-marquee { display: flex; flex-wrap: nowrap; gap: 0; width: max-content; min-width: max-content; white-space: nowrap; animation: telao-scroll-x 25s linear infinite; will-change: transform; backface-visibility: hidden; transform: translate3d(0,0,0); }
        .telao-marquee:hover { animation-play-state: paused; }
        .telao-marquee-segment { display: flex; flex-wrap: nowrap; flex-shrink: 0; }
        .telao-sales-loop { will-change: transform; backface-visibility: hidden; transform: translate3d(0,0,0); }
        .telao-sales-loop.is-animated { animation: telao-scroll-y var(--sales-loop-duration, 28s) linear infinite; }
        .telao-sales-loop.is-animated:hover { animation-play-state: paused; }
        @media (max-width: 768px) { .telao-marquee { animation-duration: 18s; } }
        @media (prefers-reduced-motion: reduce) { .telao-sales-loop { animation: none; } }
        .telao-shine { background-image: linear-gradient(90deg, #f0d78c 0%, #ffffff 50%, #f0d78c 100%); background-size: 200% 100%; background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; animation: telao-shine 4s linear infinite; }
        .telao-pop { animation: telao-pop 0.5s cubic-bezier(.34,1.56,.64,1) 1; }
        .telao-rotate { animation: telao-rotate-in 0.7s ease-out 1; }
        .telao-flash-row { animation: telao-pop 0.6s ease-out 1; box-shadow: inset 0 0 0 1px rgba(240,215,140,0.5); }
      `}</style>

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
          <div className="flex items-center gap-1 rounded border border-[#c9a84c]/30 bg-[#1a1a1a] overflow-hidden p-1 mr-2">
            <button
              onClick={enableSound}
              title={soundEnabled ? "Som Ativado" : "Som Desativado"}
              className={`h-8 w-8 grid place-items-center rounded transition ${
                soundEnabled ? "bg-[#c9a84c] text-black" : "text-[#c9a84c] hover:bg-[#c9a84c]/10"
              }`}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <select
              value={celebration.soundId}
              onChange={(e) => {
                const sid = e.target.value as SoundId;
                setSoundId(sid);
                setCelebration({ soundId: sid as any });
                playSound(sid, celebration.volume / 100, celebration.customSoundUrl);
              }}
              className="bg-transparent text-[10px] uppercase tracking-widest text-[#f0d78c] outline-none px-2 cursor-pointer border-l border-[#c9a84c]/15 h-8"
            >
              <option value="buzina" className="bg-[#1a1a1a]">Buzina</option>
              <option value="caixa" className="bg-[#1a1a1a]">Caixa</option>
              <option value="sino" className="bg-[#1a1a1a]">Sino</option>
              <option value="run-vine" className="bg-[#1a1a1a]">Run (Vine)</option>
              <option value="danger-alarm" className="bg-[#1a1a1a]">Danger Alarm</option>
              <option value="nobre" className="bg-[#1a1a1a]">Nobre</option>
              <option value="gol-da-nobre" className="bg-[#1a1a1a]">Gol da Nobre</option>
              <option value="custom" className="bg-[#1a1a1a]">Customizado</option>
            </select>
          </div>

          {celebration.soundId === "custom" && (
            <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg border border-[#c9a84c]/20 p-1 h-10 animate-in fade-in slide-in-from-left-2 mr-2">
              <Music className="w-3.5 h-3.5 text-[#c9a84c] ml-2" />
              <input 
                type="text"
                placeholder="URL do som (mp3/wav)"
                value={customSoundUrl}
                onChange={(e) => {
                  setCustomSoundUrl(e.target.value);
                  setCelebration({ customSoundUrl: e.target.value });
                }}
                className="bg-transparent border-none text-[10px] text-white w-40 outline-none placeholder:text-[#c9a84c]/30 px-2"
              />
              <button 
                onClick={() => playSound("custom", celebration.volume / 100, customSoundUrl)}
                className="h-8 w-8 grid place-items-center rounded text-[#c9a84c] hover:bg-[#c9a84c]/10"
              >
                <ArrowUpRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Picker visual original */}
          <div className="flex items-center rounded border border-[#c9a84c]/30 bg-[#1a1a1a] overflow-hidden">
            {([
              { id: "buzina", icon: Megaphone, label: "Buzina" },
              { id: "caixa", icon: Coins, label: "Caixa" },
              { id: "sino", icon: Bell, label: "Sino" },
              { id: "run-vine", icon: Music, label: "Run" },
              { id: "danger-alarm", icon: Megaphone, label: "Danger" },
              { id: "nobre", icon: Music, label: "Nobre" },
              { id: "gol-da-nobre", icon: Music, label: "Gol" },
            ] as { id: SoundId; icon: any; label: string }[]).map(({ id, icon: Icon, label }) => (
              <button
                key={id}
                onClick={() => { 
                  setSoundId(id); 
                  setCelebration({ soundId: id as any });
                  if (soundEnabled || celebration.soundEnabled) playSound(id, celebration.volume / 100); 
                }}
                title={label}
                className={`h-10 w-10 grid place-items-center transition ${soundId === id ? "bg-[#c9a84c] text-black" : "text-[#c9a84c] hover:bg-[#c9a84c]/10"}`}
              >
                <Icon className="w-4 h-4" />
              </button>
            ))}
          </div>
          <button
            onClick={enableSound}
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

      {soundEnabled && !audioReady && (
        <div className="mb-4 rounded border border-amber-400/40 bg-amber-400/10 px-4 py-2 text-sm text-amber-100">
          Clique novamente no ícone de som se o navegador ainda não liberou o áudio.
        </div>
      )}

      {/* MARQUEE — últimas vendas rolando (abaixo do título) */}
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
            {[0, 1].map((seg) => (
              <div key={`mq-seg-${seg}`} className="telao-marquee-segment" aria-hidden={seg === 1}>
                {marqueeSales.map((s) => (
                  <span key={`${s.id}-mq-${seg}`} className="inline-flex items-center gap-3 px-6 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c9a84c]" />
                    <span className="uppercase tracking-widest text-[#c9a84c]/70 text-xs">{s.sale_date ? fmtDate(s.sale_date) : fmtTime(s.created_at)}</span>
                    <span className="text-white font-semibold">{cName(s.customer_id)}</span>
                    <span className="text-[#c9a84c]/50">·</span>
                    <span className="text-[#f0d78c] font-bold tabular-nums">{formatCurrency(Number(s.total_amount || 0))}</span>
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`
        .telao-dash-grid {
          display: grid;
          gap: 18px;
          align-items: start;
          grid-template-columns: 1fr;
          grid-template-areas: "hero" "kpis" "sales" "tops" "topp";
        }
        @media (min-width: 1024px) {
          .telao-dash-grid {
            gap: 20px;
            grid-template-columns: 1.6fr 1fr;
            grid-template-areas:
              "hero  kpis"
              "sales tops"
              "sales topp";
          }
        }
        .telao-area-hero  { grid-area: hero; }
        .telao-area-kpis  { grid-area: kpis; }
        .telao-area-sales { grid-area: sales; }
        .telao-area-tops  { grid-area: tops; }
        .telao-area-topp  { grid-area: topp; }
        @media (min-width: 1024px) {
          .telao-area-tops { align-self: start; }
          .telao-area-topp { align-self: start; margin-top: -8px; }
        }
        .telao-kpi-pair { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
      `}</style>

      {/* OVERLAY: nova venda - nome do vendedor gigante */}
      {bigSeller && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(13,13,13,0.85) 0%, rgba(13,13,13,0.95) 70%)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="text-center px-8"
            style={{ animation: "telao-big-in 0.7s cubic-bezier(.34,1.56,.64,1) 1" }}
          >
            <div
              className="inline-block uppercase tracking-[0.4em] text-black bg-gradient-to-r from-[#f0d78c] to-[#c9a84c] px-6 py-2 rounded-full font-bold mb-6 shadow-[0_0_60px_rgba(240,215,140,0.6)]"
              style={{ fontSize: "clamp(1.2rem, 3vw, 2.5rem)", animation: "telao-sub-bounce 0.6s ease-in-out infinite" }}
            >
              + Mais uma venda!
            </div>
            <div
              className="font-black telao-shine leading-none"
              style={{
                fontSize: "clamp(4rem, 14vw, 18rem)",
                letterSpacing: "-0.04em",
                animation: "telao-big-glow 1.2s ease-in-out infinite",
              }}
            >
              {bigSeller.name}
            </div>
            <div
              className="mt-8 font-extrabold tabular-nums text-[#34d399] leading-none"
              style={{
                fontSize: "clamp(2.5rem, 9vw, 11rem)",
                letterSpacing: "-0.03em",
                textShadow: "0 0 40px rgba(52,211,153,0.7), 0 0 100px rgba(52,211,153,0.4)",
                animation: "telao-pop 0.6s cubic-bezier(.34,1.56,.64,1) 1",
              }}
            >
              {formatCurrency(bigSeller.amount)}
            </div>
            <div
              className="mt-6 uppercase tracking-[0.5em] text-[#f0d78c]"
              style={{ fontSize: "clamp(1rem, 2.2vw, 2rem)" }}
            >
              Parabéns!
            </div>
          </div>
        </div>
      )}

      {/* OVERLAY: novo recebimento - produtor + valor recebido */}
      {bigReceipt && (
        <div
          className="fixed inset-0 z-[9999] flex flex-col items-center justify-center pointer-events-none"
          style={{ background: "radial-gradient(circle at center, rgba(13,13,13,0.85) 0%, rgba(13,13,13,0.95) 70%)", backdropFilter: "blur(6px)" }}
        >
          <div
            className="text-center px-8"
            style={{ animation: "telao-big-in 0.7s cubic-bezier(.34,1.56,.64,1) 1" }}
          >
            <div
              className="inline-block uppercase tracking-[0.4em] text-black bg-gradient-to-r from-emerald-300 to-emerald-500 px-6 py-2 rounded-full font-bold mb-6 shadow-[0_0_60px_rgba(52,211,153,0.6)]"
              style={{ fontSize: "clamp(1.2rem, 3vw, 2.5rem)", animation: "telao-sub-bounce 0.6s ease-in-out infinite" }}
            >
              + Valor recebido!
            </div>
            <div
              className="font-black telao-shine leading-none"
              style={{
                fontSize: "clamp(4rem, 14vw, 18rem)",
                letterSpacing: "-0.04em",
                animation: "telao-big-glow 1.2s ease-in-out infinite",
              }}
            >
              {bigReceipt.name}
            </div>
            <div
              className="mt-8 font-extrabold tabular-nums text-emerald-400 leading-none"
              style={{
                fontSize: "clamp(2.5rem, 9vw, 11rem)",
                letterSpacing: "-0.03em",
                textShadow: "0 0 40px rgba(52,211,153,0.7), 0 0 100px rgba(52,211,153,0.4)",
                animation: "telao-pop 0.6s cubic-bezier(.34,1.56,.64,1) 1",
              }}
            >
              {formatCurrency(bigReceipt.amount)}
            </div>
            <div
              className="mt-6 uppercase tracking-[0.5em] text-emerald-300"
              style={{ fontSize: "clamp(1rem, 2.2vw, 2rem)" }}
            >
              Pagamento confirmado
            </div>
          </div>
        </div>
      )}

      {/* DASHBOARD GRID */}
      <div className="telao-dash-grid">
        {/* HERO HOJE — Faturamento */}
        <div
          className={`telao-area-hero relative overflow-hidden rounded-lg p-8 border border-[#c9a84c]/30 ${pulseHero ? "telao-pulse" : ""}`}
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
            <div className="flex items-end gap-4 flex-wrap justify-between">
              <div
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.01em" }}
                className="text-[clamp(3.5rem,9vw,8rem)] leading-none tabular-nums telao-shine"
              >
                {formatCurrency(heroVal)}
              </div>
              <div className="pb-3 text-right">
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/60">Ticket médio</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-white tabular-nums">
                  {formatCurrency(ticketVal)}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-end justify-between border-t border-[#c9a84c]/15 pt-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-emerald-400/80">Sinal · Hoje</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className="text-4xl text-emerald-400 tabular-nums">
                  {formatCurrency(sinalVal)}
                </div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400/80">Receb. pendentes · Hoje</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className={`text-4xl text-emerald-400 tabular-nums ${pendenteFlash ? "telao-pop telao-pulse" : ""}`}>
                  {formatCurrency(pendenteVal)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-emerald-400/80">Total · Hoje</div>
                <div style={{ fontFamily: '"Bebas Neue", sans-serif' }} className={`text-4xl text-emerald-400 tabular-nums ${pendenteFlash ? "telao-pop telao-pulse" : ""}`}>
                  {formatCurrency(sinalVal + pendenteVal)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* KPIs Semana + Mês */}
        <div className="telao-area-kpis telao-kpi-pair">
          <KpiBlock label="Semana" value={totalSemana} count={weekSales.length} />
          <KpiBlock label="Mês" value={totalMes} count={monthSales.length} accent />
        </div>

        {/* TICKER VENDAS DO DIA */}
        <div className="telao-area-sales rounded-lg border border-[#c9a84c]/20 bg-[#111]/80 overflow-hidden">
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
            className="overflow-hidden"
            style={{
              height: `clamp(260px, 38vh, ${loopSales.length ? Math.min(VISIBLE_SALES_ROWS, loopSales.length) * SALE_ROW_HEIGHT : 460}px)`,
              maskImage: todaySales.length ? "linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent)" : undefined,
              WebkitMaskImage: todaySales.length ? "linear-gradient(to bottom, transparent, #000 7%, #000 93%, transparent)" : undefined,
            }}
          >
            {loopSales.length === 0 ? (
              <div className="h-full grid place-items-center text-[#c9a84c]/50 uppercase tracking-widest text-sm px-6 text-center">
                Nenhuma venda registrada ainda.
              </div>
            ) : (
              <ul
                key={`real-sales-${loopSales.length}`}
                className={`telao-sales-loop ${shouldAnimateSales ? "is-animated" : ""}`}
                style={{ "--sales-loop-duration": `${salesLoopDuration}s` } as any}
              >
                {(shouldAnimateSales ? [0, 1] : [0]).map((segment) =>
                  loopSales.map((s, index) => {
                    const name = cName(s.customer_id);
                    const initial = (name?.[0] ?? "?").toUpperCase();
                    const isFirst = segment === 0 && index === 0 && pulseHero;
                    const ps = paymentStatusLabel(s.payment_status);
                    return (
                      <li
                        key={`${s.id}-loop-${segment}`}
                        aria-hidden={segment === 1}
                        className={`group grid grid-cols-[auto_1fr_auto_auto] items-center gap-4 px-5 py-3 border-b border-[#c9a84c]/8 transition min-h-[72px] ${isFirst ? "telao-flash-row bg-[#c9a84c]/10" : ""}`}
                      >
                        <div className="w-10 h-10 rounded grid place-items-center border border-[#c9a84c]/30 bg-[#1a1a1a] text-[#c9a84c] font-bold">
                          {initial}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-white truncate">{name}</div>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#c9a84c]/30 bg-[#c9a84c]/10 text-[10px] uppercase tracking-wider text-[#f0d78c]">
                              <span className="text-[#c9a84c]/70">Vend:</span> {sellerNameOf(s)}
                            </span>
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-[#c9a84c]/30 bg-[#c9a84c]/10 text-[10px] uppercase tracking-wider text-[#f0d78c]">
                              <span className="text-[#c9a84c]/70">Prod:</span> {producerNameOf(s)}
                            </span>
                            <span className="text-[10px] uppercase tracking-wider text-[#c9a84c]/60">
                              {serviceName(s)} · {s.sale_date ? fmtDate(s.sale_date) : fmtTime(s.created_at)}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          <div
                            style={{ fontFamily: '"Bebas Neue", sans-serif' }}
                            className="text-2xl text-[#f0d78c] tabular-nums leading-none"
                          >
                            {formatCurrency(Number(s.total_amount || 0))}
                          </div>
                          <span
                            className="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded"
                            style={{ color: ps.color, backgroundColor: ps.bg, border: `1px solid ${ps.color}40` }}
                          >
                            {ps.label}
                          </span>
                        </div>
                        {segment === 0 && (
                          <button
                            onClick={() => openEdit(s)}
                            title="Editar venda"
                            className="h-8 w-8 grid place-items-center rounded border border-[#c9a84c]/30 text-[#c9a84c] hover:bg-[#c9a84c]/10 transition opacity-0 group-hover:opacity-100"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {segment === 1 && <span aria-hidden className="w-8" />}
                      </li>
                    );
                  })
                )}
              </ul>
            )}
          </div>
        </div>

        {/* PÓDIOS */}
        <div className="telao-area-tops">
          <Podium title="Top Vendedores" rows={topSellers} />
        </div>
        <div className="telao-area-topp">
          <Podium title="Top Produtores" rows={topProducers} unitSingular="vídeo produzido" unitPlural="vídeos produzidos" />
        </div>
      </div>

      <footer className="mt-6 pt-4 border-t border-[#c9a84c]/15 flex items-center justify-between text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/40">
        <span>Gestão Nobre · sala de operações</span>
        <span>Pressione F para tela cheia · Esc para sair</span>
      </footer>

      {editing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
          onClick={closeEdit}
        >
          <div
            className="w-full max-w-md rounded-lg border border-[#c9a84c]/40 bg-[#1a1a1a] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3
                style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
                className="text-2xl text-[#f0d78c]"
              >
                EDITAR VENDA
              </h3>
              <button
                onClick={closeEdit}
                className="h-8 w-8 grid place-items-center rounded text-[#c9a84c] hover:bg-[#c9a84c]/10"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4 text-sm">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/70 mb-1">Cliente</div>
                <div className="text-white">{cName(editing.customer_id)}</div>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#c9a84c]/70 mb-1">Vendedor</label>
                <select
                  value={editSeller}
                  onChange={(e) => setEditSeller(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-[#c9a84c]/30 text-white rounded px-3 py-2 focus:outline-none focus:border-[#c9a84c]"
                >
                  <option value="">— Nenhum —</option>
                  {sellers.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-[#c9a84c]/70 mb-1">Produtor</label>
                <select
                  value={editProducer}
                  onChange={(e) => setEditProducer(e.target.value)}
                  className="w-full bg-[#0d0d0d] border border-[#c9a84c]/30 text-white rounded px-3 py-2 focus:outline-none focus:border-[#c9a84c]"
                >
                  <option value="">— Nenhum —</option>
                  {producers.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <div className="mt-2">
                  <label className="block text-[10px] uppercase tracking-widest text-[#c9a84c]/70 mb-1">
                    Ou criar novo produtor
                  </label>
                  <input
                    type="text"
                    value={newProducerName}
                    onChange={(e) => setNewProducerName(e.target.value)}
                    placeholder="Nome do novo produtor"
                    className="w-full bg-[#0d0d0d] border border-[#c9a84c]/30 text-white rounded px-3 py-2 focus:outline-none focus:border-[#c9a84c] placeholder:text-[#c9a84c]/30"
                  />
                  {newProducerName.trim() && (
                    <div className="text-[10px] text-[#c9a84c]/70 mt-1">
                      Um novo produtor será criado e vinculado a esta venda.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-2">
              <button
                onClick={closeEdit}
                disabled={savingEdit}
                className="h-10 px-4 rounded border border-[#c9a84c]/30 text-[#c9a84c] hover:bg-[#c9a84c]/10 transition disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                className="h-10 px-5 rounded bg-[#c9a84c] text-black font-semibold hover:bg-[#f0d78c] transition disabled:opacity-50"
              >
                {savingEdit ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
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

function Podium({
  title,
  rows,
  mode = "sales",
  periodLabel,
  totalLabel,
  filterControls,
  unitSingular,
  unitPlural,
}: {
  title: string;
  rows: { name: string; total: number; qtd: number }[];
  mode?: "sales" | "videos";
  periodLabel?: string;
  totalLabel?: string;
  filterControls?: React.ReactNode;
  unitSingular?: string;
  unitPlural?: string;
}) {
  return (
    <div className="rounded-lg border border-[#c9a84c]/20 bg-[#111]/80 overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-[#c9a84c]/15">
        <h3
          style={{ fontFamily: '"Bebas Neue", sans-serif', letterSpacing: "0.08em" }}
          className="text-xl text-[#f0d78c]"
        >
          {title.toUpperCase()}
        </h3>
        <div className="flex items-center gap-2">
          {filterControls}
          <span className="text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/60">
            {periodLabel ?? "mês"}
          </span>
        </div>
      </div>
      {totalLabel && (
        <div className="px-4 py-2 border-b border-[#c9a84c]/10 text-[10px] uppercase tracking-[0.3em] text-[#c9a84c]/70">
          Total: <span className="text-[#f0d78c]">{totalLabel}</span>
        </div>
      )}
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
              <div className="text-[10px] uppercase tracking-widest text-[#c9a84c]/50">
                {r.qtd}{" "}
                {unitSingular && unitPlural
                  ? (r.qtd === 1 ? unitSingular : unitPlural)
                  : mode === "videos"
                  ? `vídeo${r.qtd === 1 ? "" : "s"} pronto${r.qtd === 1 ? "" : "s"}`
                  : `venda${r.qtd === 1 ? "" : "s"}`}
              </div>
            </div>
            <div
              style={{ fontFamily: '"Bebas Neue", sans-serif' }}
              className="text-xl text-[#f0d78c] tabular-nums"
            >
              {mode === "videos" ? r.qtd : formatCurrency(r.total)}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}