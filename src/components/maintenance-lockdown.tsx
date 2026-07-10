import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@tanstack/react-router";
import { Construction, ShieldAlert, Clock } from "lucide-react";

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
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-background via-background to-amber-950/20 px-4 py-10 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.15),transparent_60%),radial-gradient(circle_at_80%_80%,rgba(239,68,68,0.12),transparent_55%)]" />
      <div className="relative w-full max-w-2xl">
        <div className="rounded-3xl border border-amber-500/30 bg-card/80 backdrop-blur-xl shadow-2xl shadow-amber-500/10 p-8 sm:p-12 text-center">
          <div className="mx-auto mb-6 relative w-28 h-28">
            <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 animate-pulse opacity-40 blur-2xl" />
            <div className="relative w-full h-full rounded-full bg-gradient-to-br from-amber-500 via-orange-500 to-red-500 grid place-items-center shadow-lg shadow-amber-500/40">
              <Construction className="h-14 w-14 text-white" strokeWidth={2.2} />
            </div>
          </div>

          {/* Barreira de manutenção estilizada */}
          <div className="flex items-center justify-center gap-1 mb-6" aria-hidden>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className={`h-2.5 w-8 rounded-sm ${i % 2 === 0 ? "bg-amber-500" : "bg-neutral-900 dark:bg-neutral-100"}`} />
            ))}
          </div>

          <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-500 mb-4">
            <ShieldAlert className="h-3.5 w-3.5" />
            Plataforma em manutenção
          </div>

          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight mb-3">{lock.title || "Estamos em manutenção"}</h1>
          <p className="text-base sm:text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto whitespace-pre-line">
            {lock.body || "Estamos trabalhando para melhorias na plataforma para que você não tenha instabilidades ou frustrações. Foi necessário tirar a plataforma do ar por um período curto para manutenção periódica, garantindo que tudo funcione 100% redondo. Obrigado pela paciência!"}
          </p>

          {ends && (
            <div className="mt-6 inline-flex items-center gap-2 rounded-lg border bg-muted/40 px-4 py-2 text-sm">
              <Clock className="h-4 w-4 text-amber-500" />
              <span className="text-muted-foreground">Previsão de retorno:</span>
              <span className="font-semibold">{ends.toLocaleString("pt-BR")}</span>
            </div>
          )}

          <div className="mt-8 text-xs text-muted-foreground">
            Esta página será atualizada automaticamente assim que a plataforma voltar ao ar.
          </div>
        </div>
      </div>
    </div>
  );
}
