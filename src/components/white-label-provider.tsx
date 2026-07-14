import { useEffect } from "react";

const STORAGE_KEY = "wl:settings:v1";

type Settings = Partial<{
  logo: string | null;
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
}>;

function apply(s: Settings) {
  const r = document.documentElement.style;
  if (s.primary) r.setProperty("--color-primary", s.primary);
  if (s.secondary) r.setProperty("--color-secondary", s.secondary);
  if (s.background) r.setProperty("--color-background", s.background);
  if (s.foreground) r.setProperty("--color-foreground", s.foreground);
  if (s.logo) r.setProperty("--wl-logo", `url(${s.logo})`);
}

/**
 * Loads white-label settings from localStorage on app boot and applies them
 * as CSS custom properties on <html>, so every route inherits the theme.
 * Also syncs across tabs via the `storage` event.
 */
export function WhiteLabelProvider() {
  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) apply(JSON.parse(raw));
      } catch {}
    };
    load();
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) load();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  return null;
}