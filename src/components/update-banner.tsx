import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { confetti } from "@/lib/confetti";

async function getVersion(): Promise<string | null> {
  try {
    const res = await fetch("/?_v=" + Date.now(), {
      method: "GET",
      cache: "no-store",
      headers: { "cache-control": "no-cache" },
    });
    const text = await res.text();
    // Extract hashed asset filenames from <script src="/assets/..."> and <link href="/assets/...">.
    // These only change on real deploys, so we ignore CDN-variant ETags and header reorderings.
    const matches = text.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g);
    if (matches && matches.length > 0) {
      return matches.sort().join("|");
    }
    return null;
  } catch {
    return null;
  }
}

export function UpdateBanner() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    let initial: string | null = null;
    let cancelled = false;
    let lastCheck = 0;

    const check = async () => {
      lastCheck = Date.now();
      try {
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
      } catch (e) {
        console.warn("Update check failed:", e);
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