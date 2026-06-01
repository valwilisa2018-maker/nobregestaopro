import { useEffect, useState } from "react";

const KEY = "telao.loopDuplicateThreshold";
export const TELAO_THRESHOLD_DEFAULT = 10;
export const TELAO_THRESHOLD_MIN = 1;
export const TELAO_THRESHOLD_MAX = 200;

function read(): number {
  if (typeof window === "undefined") return TELAO_THRESHOLD_DEFAULT;
  const raw = window.localStorage.getItem(KEY);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return TELAO_THRESHOLD_DEFAULT;
  return Math.min(TELAO_THRESHOLD_MAX, Math.max(TELAO_THRESHOLD_MIN, Math.round(n)));
}

export function useLoopDuplicateThreshold(): [number, (n: number) => void] {
  const [val, setVal] = useState<number>(() => read());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setVal(read());
    };
    const onCustom = () => setVal(read());
    window.addEventListener("storage", onStorage);
    window.addEventListener("telao-settings-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("telao-settings-changed", onCustom);
    };
  }, []);

  const set = (n: number) => {
    const clamped = Math.min(
      TELAO_THRESHOLD_MAX,
      Math.max(TELAO_THRESHOLD_MIN, Math.round(Number(n) || TELAO_THRESHOLD_DEFAULT)),
    );
    window.localStorage.setItem(KEY, String(clamped));
    window.dispatchEvent(new Event("telao-settings-changed"));
    setVal(clamped);
  };

  return [val, set];
}

const OVERLAY_KEY = "telao.bigSellerOverlaySeconds";
export const TELAO_OVERLAY_DEFAULT = 20;
export const TELAO_OVERLAY_MIN = 3;
export const TELAO_OVERLAY_MAX = 120;

function readOverlay(): number {
  if (typeof window === "undefined") return TELAO_OVERLAY_DEFAULT;
  const raw = window.localStorage.getItem(OVERLAY_KEY);
  const n = raw == null ? NaN : Number(raw);
  if (!Number.isFinite(n)) return TELAO_OVERLAY_DEFAULT;
  return Math.min(TELAO_OVERLAY_MAX, Math.max(TELAO_OVERLAY_MIN, Math.round(n)));
}

export function useBigSellerOverlaySeconds(): [number, (n: number) => void] {
  const [val, setVal] = useState<number>(() => readOverlay());

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === OVERLAY_KEY) setVal(readOverlay());
    };
    const onCustom = () => setVal(readOverlay());
    window.addEventListener("storage", onStorage);
    window.addEventListener("telao-settings-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("telao-settings-changed", onCustom);
    };
  }, []);

  const set = (n: number) => {
    const clamped = Math.min(
      TELAO_OVERLAY_MAX,
      Math.max(TELAO_OVERLAY_MIN, Math.round(Number(n) || TELAO_OVERLAY_DEFAULT)),
    );
    window.localStorage.setItem(OVERLAY_KEY, String(clamped));
    window.dispatchEvent(new Event("telao-settings-changed"));
    setVal(clamped);
  };

  return [val, set];
}