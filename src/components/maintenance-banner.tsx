import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Wrench } from "lucide-react";

type M = { id: string; title: string; body: string };

export function MaintenanceBanner() {
  const [item, setItem] = useState<M | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchIt = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("id,title,body")
        .eq("is_active", true)
        .eq("severity", "maintenance")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setItem((data as M) ?? null);
    };
    fetchIt();
    const ch = supabase
      .channel("maintenance-banner")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, fetchIt)
      .subscribe();
    const t = setInterval(fetchIt, 30000);
    return () => { cancelled = true; clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  if (!item) return null;
  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-amber-500 via-orange-500 to-amber-500 text-white">
      <div className="flex items-center justify-center gap-2 px-4 py-2 text-xs sm:text-sm font-medium">
        <Wrench className="h-4 w-4 shrink-0 animate-pulse" />
        <span className="truncate">
          <strong>{item.title}</strong>
          <span className="opacity-90"> — {item.body}</span>
        </span>
      </div>
    </div>
  );
}