import { useEffect, useState } from "react";
import { persistTelaoSettings } from "./use-telao-settings-sync";

const SOUND_KEY = "telao.celebration.soundEnabled";
const CONFETTI_KEY = "telao.celebration.confettiEnabled";
const VOLUME_KEY = "telao.celebration.volume";
const EVENT = "telao-celebration-changed";

export type CelebrationSettings = {
  soundEnabled: boolean;
  confettiEnabled: boolean;
  volume: number; // 0..100
};

function readBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1" || v === "true";
}

function readVolume(): number {
  if (typeof window === "undefined") return 70;
  const raw = window.localStorage.getItem(VOLUME_KEY);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return 70;
  return Math.min(100, Math.max(0, Math.round(n)));
}

function readAll(): CelebrationSettings {
  return {
    soundEnabled: readBool(SOUND_KEY, true),
    confettiEnabled: readBool(CONFETTI_KEY, true),
    volume: readVolume(),
  };
}

export function useCelebrationSettings(): [
  CelebrationSettings,
  (patch: Partial<CelebrationSettings>) => void,
] {
  const [val, setVal] = useState<CelebrationSettings>(() => readAll());

  useEffect(() => {
    const refresh = () => setVal(readAll());
    const onStorage = (e: StorageEvent) => {
      if (e.key === SOUND_KEY || e.key === CONFETTI_KEY || e.key === VOLUME_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(EVENT, refresh);
    };
  }, []);

  const update = (patch: Partial<CelebrationSettings>) => {
    if (patch.soundEnabled !== undefined)
      window.localStorage.setItem(SOUND_KEY, patch.soundEnabled ? "1" : "0");
    if (patch.confettiEnabled !== undefined)
      window.localStorage.setItem(CONFETTI_KEY, patch.confettiEnabled ? "1" : "0");
    if (patch.volume !== undefined) {
      const v = Math.min(100, Math.max(0, Math.round(patch.volume)));
      window.localStorage.setItem(VOLUME_KEY, String(v));
    }
    window.dispatchEvent(new Event(EVENT));
    setVal(readAll());
    const dbPatch: Record<string, unknown> = {};
    if (patch.soundEnabled !== undefined) dbPatch.celebration_sound_enabled = patch.soundEnabled;
    if (patch.confettiEnabled !== undefined) dbPatch.celebration_confetti_enabled = patch.confettiEnabled;
    if (patch.volume !== undefined)
      dbPatch.celebration_volume = Math.min(100, Math.max(0, Math.round(patch.volume)));
    if (Object.keys(dbPatch).length > 0) {
      void persistTelaoSettings(dbPatch as never).catch(() => {});
    }
  };

  return [val, update];
}