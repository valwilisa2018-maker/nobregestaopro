import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import maintenanceImage from "@/assets/maintenance.png.asset.json";

type Lock = { title: string; body: string; ends_at: string | null; starts_at: string };

export function MaintenanceLockdown({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const [lock, setLock] = useState<Lock | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchLock = async () => {
      const { data } = await supabase
        .from("announcements")
        .select("title,body,ends_at,starts_at")
        .eq("is_active", true)
        .eq("lockdown", true)
        .lte("starts_at", new Date().toISOString())
        .or(`ends_at.is.null,ends_at.gte.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) { setLock((data as Lock) ?? null); setChecked(true); }
    };
    fetchLock();
    const ch = supabase
      .channel("lockdown-gate")
      .on("postgres_changes", { event: "*", schema: "public", table: "announcements" }, fetchLock)
      .subscribe();
    const t = setInterval(fetchLock, 30000);
    return () => { cancelled = true; clearInterval(t); supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!session) { setIsMaster(false); return; }
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "master" });
      if (!cancelled) setIsMaster(!!data);
    })();
    return () => { cancelled = true; };
  }, [session]);

  if (!checked) return <>{children}</>;
  if (!lock) return <>{children}</>;
  // Master bypass always. Also allow /master/* routes so master can log in and access the panel.
  const path = location.pathname || "";
  if (isMaster || path.startsWith("/master")) return <>{children}</>;

  return <LockdownScreen lock={lock} />;
}

function LockdownScreen({ lock }: { lock: Lock }) {
  const ends = lock.ends_at ? new Date(lock.ends_at) : null;
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-black px-4 py-6">
      <img
        src={maintenanceImage.url}
        alt={lock.title || "Estamos em manutenção"}
        className="w-full max-w-2xl h-auto object-contain rounded-2xl shadow-2xl"
      />
      {ends && (
        <div className="mt-6 inline-flex items-center gap-2 rounded-lg border border-purple-500/30 bg-purple-500/10 px-4 py-2 text-sm text-white">
          <Clock className="h-4 w-4 text-purple-400" />
          <span className="text-purple-200/80">Previsão de retorno:</span>
          <span className="font-semibold">{ends.toLocaleString("pt-BR")}</span>
        </div>
      )}
    </div>
  );
}
