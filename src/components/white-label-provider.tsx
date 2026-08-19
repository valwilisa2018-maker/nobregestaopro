import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { applyWhiteLabelSettings, cacheWhiteLabelSettings, getCachedWhiteLabelSettings, loadWhiteLabelSettings } from "@/lib/white-label";

/**
 * Loads white-label settings from localStorage on app boot and applies them
 * as CSS custom properties on <html>, so every route inherits the theme.
 * Also syncs across tabs via the `storage` event.
 */
export function WhiteLabelProvider() {
  useEffect(() => {
    applyWhiteLabelSettings(getCachedWhiteLabelSettings());
    void loadWhiteLabelSettings().then(cacheWhiteLabelSettings).catch(() => undefined);
    const channel = supabase
      .channel("white-label-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "white_label_settings" }, () => {
        void loadWhiteLabelSettings().then(cacheWhiteLabelSettings).catch(() => undefined);
      })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, []);
  return null;
}
