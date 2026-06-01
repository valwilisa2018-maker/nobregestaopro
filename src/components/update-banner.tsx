import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";

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
      if (v !== initial) setAvailable(true);
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