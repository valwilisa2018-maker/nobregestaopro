import { supabase } from "@/integrations/supabase/client";

export type WhiteLabelSettings = {
  logo: string | null;
  primary: string;
  secondary: string;
  background: string;
  foreground: string;
};

export const WHITE_LABEL_STORAGE_KEY = "wl:settings:v2";
export const WHITE_LABEL_EVENT = "white-label-settings-changed";

function isLightColor(hex: string) {
  const value = hex.replace("#", "");
  if (!/^[0-9a-f]{6}$/i.test(value)) return false;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150;
}

export const DEFAULT_WHITE_LABEL_SETTINGS: WhiteLabelSettings = {
  logo: null,
  primary: "#dc2626",
  secondary: "#27272a",
  background: "#18181b",
  foreground: "#fafafa",
};

export function applyWhiteLabelSettings(settings: WhiteLabelSettings) {
  const style = document.documentElement.style;
  style.setProperty("--primary", settings.primary);
  style.setProperty("--ring", settings.primary);
  style.setProperty("--sidebar-primary", settings.primary);
  style.setProperty("--gradient-primary", `linear-gradient(135deg, ${settings.primary}, ${settings.primary}cc)`);

  // A paleta personalizada complementa apenas o modo a que pertence. Isso
  // evita misturar fundo escuro com cards e textos do modo claro (e vice-versa).
  const palette = isLightColor(settings.background) ? "light" : "dark";
  const other = palette === "light" ? "dark" : "light";
  style.setProperty(`--wl-${palette}-background`, settings.background);
  style.setProperty(`--wl-${palette}-foreground`, settings.foreground);
  style.setProperty(`--wl-${palette}-secondary`, settings.secondary);
  style.removeProperty(`--wl-${other}-background`);
  style.removeProperty(`--wl-${other}-foreground`);
  style.removeProperty(`--wl-${other}-secondary`);

  // Remove valores antigos da primeira versão, que tinham prioridade sobre
  // as classes .light e .dark e causavam o tema híbrido.
  style.removeProperty("--background");
  style.removeProperty("--foreground");
  style.removeProperty("--secondary");
}

export function cacheWhiteLabelSettings(settings: WhiteLabelSettings) {
  localStorage.setItem(WHITE_LABEL_STORAGE_KEY, JSON.stringify(settings));
  applyWhiteLabelSettings(settings);
  window.dispatchEvent(new CustomEvent(WHITE_LABEL_EVENT, { detail: settings }));
}

export function getCachedWhiteLabelSettings() {
  try {
    const raw = localStorage.getItem(WHITE_LABEL_STORAGE_KEY);
    return raw ? ({ ...DEFAULT_WHITE_LABEL_SETTINGS, ...JSON.parse(raw) } as WhiteLabelSettings) : DEFAULT_WHITE_LABEL_SETTINGS;
  } catch {
    return DEFAULT_WHITE_LABEL_SETTINGS;
  }
}

export async function loadWhiteLabelSettings() {
  const { data, error } = await supabase
    .from("white_label_settings" as any)
    .select("logo,primary_color,secondary_color,background_color,foreground_color")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) return getCachedWhiteLabelSettings();
  return {
    logo: (data as any).logo,
    primary: (data as any).primary_color,
    secondary: (data as any).secondary_color,
    background: (data as any).background_color,
    foreground: (data as any).foreground_color,
  } satisfies WhiteLabelSettings;
}

export async function saveWhiteLabelSettings(settings: WhiteLabelSettings) {
  const { data: userData } = await supabase.auth.getUser();
  const { error } = await supabase.from("white_label_settings" as any).upsert({
    id: true,
    logo: settings.logo,
    primary_color: settings.primary,
    secondary_color: settings.secondary,
    background_color: settings.background,
    foreground_color: settings.foreground,
    updated_at: new Date().toISOString(),
    updated_by: userData.user?.id ?? null,
  });
  if (error) throw error;
  cacheWhiteLabelSettings(settings);
}
