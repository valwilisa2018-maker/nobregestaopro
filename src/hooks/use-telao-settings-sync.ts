import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

const SOUND_KEY = "telao.celebration.soundEnabled";
const CONFETTI_KEY = "telao.celebration.confettiEnabled";
const VOLUME_KEY = "telao.celebration.volume";
const THRESHOLD_KEY = "telao.loopDuplicateThreshold";
const OVERLAY_KEY = "telao.bigSellerOverlaySeconds";

type Row = {
  big_seller_overlay_seconds: number;
  loop_duplicate_threshold: number;
  celebration_sound_enabled: boolean;
  celebration_confetti_enabled: boolean;
  celebration_volume: number;
};

function applyRow(row: Row) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(OVERLAY_KEY, String(row.big_seller_overlay_seconds));
  window.localStorage.setItem(THRESHOLD_KEY, String(row.loop_duplicate_threshold));
  window.localStorage.setItem(SOUND_KEY, row.celebration_sound_enabled ? "1" : "0");
  window.localStorage.setItem(CONFETTI_KEY, row.celebration_confetti_enabled ? "1" : "0");
  window.localStorage.setItem(VOLUME_KEY, String(row.celebration_volume));
  window.dispatchEvent(new Event("telao-settings-changed"));
  window.dispatchEvent(new Event("telao-celebration-changed"));
}

export async function persistTelaoSettings(patch: Partial<Row>): Promise<void> {
  const { error } = await supabase
    .from("telao_settings")
    .update(patch as any)
    .eq("id" as any, true);
  if (error) throw error;
}

export function useTelaoSettingsSync() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("telao_settings")
        .select("*")
        .eq("id" as any, true)
        .maybeSingle();
      if (cancelled || error || !data) return;
      applyRow(data as Row);
    })();

    const channel = supabase
      .channel("telao_settings_changes")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "telao_settings" },
        (payload) => {
          const next = payload.new as Row | undefined;
          if (next) applyRow(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, []);
}