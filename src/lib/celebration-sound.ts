// Shared sound playback used for sales celebration on Telão and goal celebrations
// on Dashboard/Telão. Mirrors the sale sound logic so both trigger identically.

export type SoundId =
  | "buzina"
  | "caixa"
  | "sino"
  | "custom"
  | "run-vine"
  | "danger-alarm"
  | "nobre"
  | "gol-da-nobre";

const MAX_SOUND_DURATION = 35;

let sharedAudioCtx: AudioContext | null = null;
const activeCtxs = new Set<AudioContext>();
let activeSource: AudioBufferSourceNode | null = null;

function getSharedAudioCtx(): AudioContext | null {
  try {
    if (sharedAudioCtx && sharedAudioCtx.state !== "closed") return sharedAudioCtx;
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    sharedAudioCtx = new AC();
    return sharedAudioCtx;
  } catch { return null; }
}

function getCtx(): AudioContext | null {
  try {
    const AC = (window.AudioContext || (window as any).webkitAudioContext);
    return new AC();
  } catch { return null; }
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
  blast(0, 0.45, 196);
  blast(0.55, 0.7, 196);
  registerCtx(ctx, 1600);
}

function playCaixa(ctx: AudioContext, vol = 1) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.55 * vol;
  master.connect(ctx.destination);
  const click = ctx.createOscillator();
  const clickG = ctx.createGain();
  click.type = "triangle";
  click.frequency.value = 1800;
  clickG.gain.setValueAtTime(0.0001, now);
  clickG.gain.exponentialRampToValueAtTime(0.4, now + 0.005);
  clickG.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
  click.connect(clickG).connect(master);
  click.start(now); click.stop(now + 0.1);
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
  bell(0.05, 880);
  bell(0.22, 1175);
  registerCtx(ctx, 1500);
}

function playSino(ctx: AudioContext, vol = 1) {
  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.value = 0.5 * vol;
  master.connect(ctx.destination);
  const notes = [523.25, 659.25, 783.99, 1046.5];
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

export async function playCelebrationSound(id: SoundId, vol = 1, customUrl?: string) {
  stopAllSounds();
  const ctx = getSharedAudioCtx() ?? getCtx();
  if (!ctx) return;
  try { if (ctx.state === "suspended") await ctx.resume(); } catch {}

  let audioUrl = "";
  if (id === "custom" && customUrl) audioUrl = customUrl;
  else if (id === "run-vine") audioUrl = "/run-vine-sound-effect.mp3";
  else if (id === "danger-alarm") audioUrl = "/danger-alarm.mp3";
  else if (id === "nobre") audioUrl = "/nobre.mp3";
  else if (id === "gol-da-nobre") audioUrl = "/gol-da-nobre.mp3";

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
      const playDur = Math.min(audioBuffer.duration, MAX_SOUND_DURATION);
      source.start(0, 0, playDur);
      activeSource = source;
      source.onended = () => { if (activeSource === source) activeSource = null; };
      registerCtx(ctx, playDur * 1000 + 200);
      return;
    } catch (err) {
      console.error("Erro ao tocar som:", err);
      try { ctx.close(); } catch {}
      return;
    }
  }

  if (id === "buzina") playBuzina(ctx, vol);
  else if (id === "caixa") playCaixa(ctx, vol);
  else if (id === "sino") playSino(ctx, vol);
  else { try { ctx.close(); } catch {} }
}