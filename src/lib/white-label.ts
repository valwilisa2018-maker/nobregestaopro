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
  style.setProperty("--secondary", settings.secondary);
  style.setProperty("--background", settings.background);
  style.setProperty("--foreground", settings.foreground);
  style.setProperty("--gradient-primary", `linear-gradient(135deg, ${settings.primary}, ${settings.primary}cc)`);
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
