import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import confetti from "canvas-confetti";

async function getVersion(): Promise<string | null> {
  try {
    const res = await fetch("/?_v=" + Date.now(), {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    const etag = res.headers.get("etag");
    if (etag) return etag;
    const text = await res.text();
    // hash of first 5000 chars (script tags with hashed names change between builds)
    let hash = 0;
    const sample = text.slice(0, 5000);
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash + sample.charCodeAt(i)) | 0;
    }
    return String(hash);
  } catch {
    return null;
  }
}

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let initial: string | null = null;
    let cancelled = false;

    const check = async () => {
      const v = await getVersion();
      if (cancelled || !v) return;
      if (initial === null) {
        initial = v;
        return;
      }
      if (v !== initial) {
        setAvailable(true);
        triggerConfetti();
      }
    };

    const triggerConfetti = () => {
      const duration = 3 * 1000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 200 };
      const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

      const interval: any = setInterval(function() {
        const timeLeft = animationEnd - Date.now();
        if (timeLeft <= 0) return clearInterval(interval);
        const particleCount = 50 * (timeLeft / duration);
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
        confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
      }, 250);
    };

    check();
    const id = setInterval(check, 60_000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  if (!available) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-lg border border-primary/30 bg-primary text-primary-foreground px-4 py-3 shadow-lg animate-in fade-in slide-in-from-top-4">
      <RefreshCw className="w-4 h-4" />
      <span className="text-sm font-medium">Atualização disponível — recarregue a página</span>
      <button
        onClick={() => window.location.reload()}
        className="ml-2 inline-flex items-center justify-center rounded-md bg-primary-foreground/20 hover:bg-primary-foreground/30 px-3 py-1 text-sm font-semibold transition-colors"
      >
        Recarregar
      </button>
    </div>
  );
}