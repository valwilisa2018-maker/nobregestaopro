import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "@tanstack/react-router";
import { Clock, Sparkles, ShieldCheck, Rocket, Heart, Headphones, Mail } from "lucide-react";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";
import robotImg from "@/assets/maintenance-robot.png";

type Lock = { title: string; body: string; ends_at: string | null; starts_at: string };

export function MaintenanceLockdown({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();
  const [lock, setLock] = useState<Lock | null>(null);
  const [isMaster, setIsMaster] = useState(false);
  const [checked, setChecked] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>(logoAsset.url);

  useEffect(() => {
    let cancelled = false;
    const loadBranding = async () => {
      const { data } = await supabase.from("internal_config").select("value").eq("key", "branding").maybeSingle();
      if (cancelled) return;
      try {
        const parsed = data?.value ? (JSON.parse(data.value) as { maintenance_logo_url?: string }) : null;
        const url = parsed?.maintenance_logo_url?.trim();
        setLogoUrl(url || logoAsset.url);
      } catch { setLogoUrl(logoAsset.url); }
    };
    loadBranding();
    const ch = supabase
      .channel("branding-gate")
      .on("postgres_changes", { event: "*", schema: "public", table: "internal_config", filter: "key=eq.branding" }, loadBranding)
      .subscribe();
    return () => { cancelled = true; supabase.removeChannel(ch); };
  }, []);

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

  return <LockdownScreen lock={lock} logoUrl={logoUrl} />;
}

function LockdownScreen({ lock, logoUrl }: { lock: Lock; logoUrl: string }) {
  const ends = lock.ends_at ? new Date(lock.ends_at) : null;
  const title = lock.title?.trim() || "Estamos em Manutenção";
  const body = lock.body?.trim() || "Estamos trabalhando para melhorar a plataforma e trazer uma experiência ainda mais incrível para você!";
  const features = [
    { icon: Clock, title: "Melhorias", text: "Estamos aprimorando recursos e desempenho." },
    { icon: ShieldCheck, title: "Mais Segurança", text: "Reforçando a proteção dos seus dados e informações." },
    { icon: Rocket, title: "Novas Funcionalidades", text: "Preparando novidades para impulsionar seus resultados." },
    { icon: Heart, title: "Sempre por Você", text: "Nossa missão é oferecer o melhor suporte e experiência." },
  ];
  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-[#07061a] px-4 py-8 sm:py-12">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(99,102,241,0.25),transparent_60%),radial-gradient(ellipse_at_bottom,rgba(168,85,247,0.2),transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.08] [background-image:linear-gradient(rgba(255,255,255,0.6)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.6)_1px,transparent_1px)] [background-size:40px_40px]" />

      <div className="relative mx-auto flex w-full max-w-3xl flex-col items-center text-center">
        <img
          src={logoUrl}
          alt="Agent IA"
          className="h-20 w-20 sm:h-24 sm:w-24 rounded-2xl object-cover ring-1 ring-white/10"
          onError={(e) => { (e.currentTarget as HTMLImageElement).src = logoAsset.url; }}
        />
        <div className="mt-3 text-[10px] sm:text-xs tracking-[0.35em] text-white/60">PLATAFORMA INTELIGENTE</div>

        <h1 className="mt-6 text-3xl sm:text-5xl font-extrabold leading-tight bg-gradient-to-r from-sky-400 via-indigo-400 to-fuchsia-400 bg-clip-text text-transparent">
          {title}
        </h1>
        <p className="mt-4 max-w-xl text-sm sm:text-base text-white/70 whitespace-pre-line">{body}</p>

        <div className="relative mt-8 sm:mt-10 flex justify-center">
          <div className="absolute inset-x-8 bottom-2 h-8 rounded-[50%] bg-fuchsia-500/20 blur-2xl" />
          <img
            src={robotImg}
            alt="Robô em manutenção"
            width={1024}
            height={1024}
            loading="lazy"
            className="relative h-56 w-auto sm:h-72 md:h-80 drop-shadow-[0_20px_40px_rgba(139,92,246,0.35)]"
          />
        </div>

        {ends && (
          <div className="mt-6 inline-flex items-center gap-2 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-4 py-2 text-xs sm:text-sm text-white">
            <Clock className="h-4 w-4 text-fuchsia-300" />
            <span className="text-white/70">Previsão de retorno:</span>
            <span className="font-semibold">{ends.toLocaleString("pt-BR")}</span>
          </div>
        )}

        <div className="mt-8 sm:mt-10 grid w-full grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 sm:p-6 backdrop-blur">
          {features.map((f) => (
            <div key={f.title} className="flex flex-col items-center text-center gap-2">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-indigo-500/15 ring-1 ring-indigo-400/30">
                <f.icon className="h-5 w-5 text-indigo-300" />
              </div>
              <div className="text-sm font-semibold text-white">{f.title}</div>
              <div className="text-[11px] sm:text-xs leading-snug text-white/60">{f.text}</div>
            </div>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs sm:text-sm text-sky-300">
          <Sparkles className="h-4 w-4" />
          <span>Obrigado pela compreensão e por fazer parte da nossa jornada!</span>
        </div>

        <div className="mt-4 flex flex-col sm:flex-row items-center gap-2 sm:gap-3 text-xs sm:text-sm text-white/70">
          <span className="inline-flex items-center gap-2"><Headphones className="h-4 w-4" /> Precisa de ajuda?</span>
          <a
            href="mailto:suporte@agentia.com.br"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-indigo-500 to-fuchsia-500 px-4 py-1.5 font-medium text-white shadow-lg shadow-fuchsia-500/20 hover:opacity-90"
          >
            <Mail className="h-4 w-4" /> suporte@agentia.com.br
          </a>
        </div>
      </div>
    </div>
  );
}
