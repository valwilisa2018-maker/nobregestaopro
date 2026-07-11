import { useEffect, useState } from "react";
import { useRouterState, useNavigate } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, Rocket, Zap, ShieldCheck, Headphones, Brain, X,
  Hourglass, AlertTriangle, CreditCard, CalendarDays, PartyPopper,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";
import robotImg from "@/assets/maintenance-robot.png";

type PlanInfo = {
  planName: string | null;
  status: string | null;
  expiresAt: Date | null;
  daysLeft: number | null;
  hasActivePlan: boolean;
  expired: boolean;
  expiring: boolean; // ≤2 days
};

function usePlanInfo(): PlanInfo | null {
  const [info, setInfo] = useState<PlanInfo | null>(null);
  useEffect(() => {
    let cancel = false;
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("plan_id, status, plan_expires_at, plans(name)")
        .eq("id", user.id)
        .maybeSingle();
      if (cancel) return;
      const planName = (data?.plans as { name: string } | null)?.name ?? null;
      const expiresAt = data?.plan_expires_at ? new Date(data.plan_expires_at) : null;
      const daysLeft = expiresAt
        ? Math.ceil((expiresAt.getTime() - Date.now()) / 86400000)
        : null;
      const expired = !!(expiresAt && daysLeft !== null && daysLeft < 0);
      const hasActivePlan = !!(data?.plan_id && data.status === "active" && !expired);
      setInfo({
        planName,
        status: data?.status ?? null,
        expiresAt,
        daysLeft,
        hasActivePlan,
        expired,
        expiring: !!(daysLeft !== null && daysLeft >= 0 && daysLeft <= 2 && !!data?.plan_id),
      });
    };
    load();
    const ch = supabase.channel("plan-gate")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, load)
      .subscribe();
    return () => { cancel = true; supabase.removeChannel(ch); };
  }, []);
  return info;
}

const ALLOWED_WHEN_BLOCKED = ["/billing", "/plans", "/settings", "/support"];

export function PlanGate({ children }: { children: React.ReactNode }) {
  const info = usePlanInfo();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [dismissedExpiring, setDismissedExpiring] = useState(false);

  // Reset dismiss on each fresh mount (i.e., new entry into platform)
  useEffect(() => { setDismissedExpiring(false); }, []);

  if (!info) return <>{children}</>;

  const onSafePath = ALLOWED_WHEN_BLOCKED.some((p) => path.startsWith(p));
  const showWelcome = !info.hasActivePlan && !info.expired;
  const showExpired = info.expired;
  const showExpiring = info.expiring && !dismissedExpiring;
  const blocking = (showWelcome || showExpired) && !onSafePath;

  return (
    <>
      {blocking ? (
        <div className="min-h-[70vh] grid place-items-center p-6 opacity-40 pointer-events-none select-none">
          {children}
        </div>
      ) : children}

      <AnimatePresence>
        {showWelcome && (
          <PlanModal key="welcome" variant="welcome" dismissible={false} />
        )}
        {showExpired && (
          <PlanModal key="expired" variant="expired" dismissible={false} daysLeft={info.daysLeft} planName={info.planName} expiresAt={info.expiresAt} />
        )}
        {!showWelcome && !showExpired && showExpiring && (
          <PlanModal key="expiring" variant="expiring" dismissible onClose={() => setDismissedExpiring(true)} daysLeft={info.daysLeft} planName={info.planName} expiresAt={info.expiresAt} />
        )}
      </AnimatePresence>
    </>
  );
}

type ModalProps = {
  variant: "welcome" | "expiring" | "expired";
  dismissible: boolean;
  onClose?: () => void;
  daysLeft?: number | null;
  planName?: string | null;
  expiresAt?: Date | null;
};

function PlanModal({ variant, dismissible, onClose, daysLeft, planName, expiresAt }: ModalProps) {
  const navigate = useNavigate();
  const orange = variant !== "welcome";

  const heading =
    variant === "welcome" ? { pre: "Seja muito", strong: "Bem-vindo!", emoji: "👋" }
    : variant === "expired" ? { pre: "Seu plano", strong: "está vencido!", emoji: "" }
    : { pre: "Seu plano está", strong: "quase vencendo!", emoji: "" };

  const subtitle =
    variant === "welcome"
      ? <>Estamos felizes por ter você aqui. Sua jornada com <span className="text-sky-300 font-semibold">inteligência artificial</span> começa agora!</>
      : variant === "expired"
      ? <>Seu acesso está bloqueado. Renove agora para reativar todos os recursos da plataforma.</>
      : <>Para continuar aproveitando todos os recursos da plataforma sem interrupções, renove seu plano.</>;

  const cta =
    variant === "welcome" ? "Ver Planos e Começar Agora"
    : variant === "expired" ? "Renovar Meu Plano Agora"
    : "Renovar Meu Plano Agora";

  const goPlan = () => { navigate({ to: "/billing" }); onClose?.(); };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center p-4 bg-black/70 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ type: "spring", stiffness: 220, damping: 22 }}
        className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-[#07061a] text-white shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]"
      >

        {dismissible && (
          <button
            aria-label="Fechar"
            onClick={onClose}
            className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <div className="relative px-6 pt-8 pb-6 text-center">
          {/* Logo header */}
          <div className="flex items-center justify-center gap-2">
            <img src={logoAsset.url} alt="Agent IA" className="h-9 w-9 rounded-lg object-cover ring-1 ring-white/10" />
            <div className="text-left leading-none">
              <div className="text-lg font-black tracking-tight bg-gradient-to-r from-sky-300 via-white to-sky-300 bg-clip-text text-transparent">AGENTIA</div>
              <div className="text-[8px] uppercase tracking-[0.25em] text-white/50">Plataforma Inteligente</div>
            </div>
          </div>

          {/* Hero icon */}
          <div className="relative mt-6 mx-auto grid h-40 w-40 place-items-center">
            <div className={`absolute inset-0 rounded-full blur-3xl ${orange ? "bg-orange-500/40" : "bg-sky-500/40"}`} />
            <img
              src={robotImg}
              alt="Mascote AGENTIA"
              className="relative h-40 w-40 object-contain drop-shadow-[0_10px_30px_rgba(0,0,0,0.5)]"
            />
            <div className={`absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full ring-2 ring-slate-950 shadow-lg ${
              orange ? "bg-gradient-to-br from-orange-500 to-amber-600" : "bg-gradient-to-br from-sky-500 to-indigo-600"
            }`}>
              {variant === "welcome" ? <PartyPopper className="h-4 w-4 text-white" />
                : variant === "expired" ? <AlertTriangle className="h-4 w-4 text-white" />
                : <Hourglass className="h-4 w-4 text-white" />}
            </div>
          </div>

          {/* Heading */}
          <h2 className="mt-6 text-2xl font-extrabold leading-tight">
            {heading.pre}{" "}
            <span className={orange ? "text-orange-400" : "text-sky-400"}>{heading.strong}</span>{" "}
            {heading.emoji && <span>{heading.emoji}</span>}
          </h2>
          <p className="mt-3 px-2 text-sm text-white/70">{subtitle}</p>

          {/* Plan info card (expiring/expired) */}
          {variant !== "welcome" && (
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl border border-white/10 bg-white/5 p-3 text-left">
              <div className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                  <CreditCard className="h-3 w-3" /> Seu plano atual
                </div>
                <div className="mt-1 font-bold text-white truncate">{planName ?? "—"}</div>
                <div className="mt-1 inline-block rounded-md bg-orange-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-orange-300">
                  {variant === "expired" ? "Vencido" : "Expira em"}
                </div>
              </div>
              <div className="rounded-xl bg-white/5 p-3">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-white/50">
                  <CalendarDays className="h-3 w-3" /> {variant === "expired" ? "Venceu em" : "Vencimento em"}
                </div>
                <div className="mt-1 font-bold text-orange-300">
                  {variant === "expired"
                    ? (expiresAt ? expiresAt.toLocaleDateString("pt-BR") : "—")
                    : `${daysLeft ?? 0} dia${daysLeft === 1 ? "" : "s"}`}
                </div>
                <div className="mt-1 text-[10px] text-white/50">
                  {expiresAt ? expiresAt.toLocaleDateString("pt-BR") : ""}
                </div>
              </div>
            </div>
          )}

          {/* Feature strip */}
          {variant === "welcome" ? (
            <div className="mt-5 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
              <div className="text-xs font-semibold text-white/80 mb-3">O que você vai encontrar aqui:</div>
              <div className="grid grid-cols-2 gap-3 text-left">
                <Feature icon={Brain} title="Automação Inteligente" desc="Crie agentes e fluxos poderosos" tint="sky" />
                <Feature icon={Zap} title="Alta Performance" desc="Plataforma rápida e estável" tint="fuchsia" />
                <Feature icon={ShieldCheck} title="Total Controle" desc="Gerencie tudo em um só lugar" tint="emerald" />
                <Feature icon={Headphones} title="Suporte Premium" desc="Estamos sempre com você" tint="orange" />
              </div>
            </div>
          ) : (
            <div className="mt-5 rounded-2xl border border-orange-400/20 bg-orange-500/[0.04] p-4">
              <div className="text-xs font-semibold text-orange-300 mb-3">O que você pode perder?</div>
              <ul className="space-y-2 text-left text-xs text-white/80">
                <li className="flex items-center gap-2"><Zap className="h-3.5 w-3.5 text-orange-400 shrink-0" /> Seus agentes podem ser pausados</li>
                <li className="flex items-center gap-2"><Rocket className="h-3.5 w-3.5 text-orange-400 shrink-0" /> Suas integrações podem ser limitadas</li>
                <li className="flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-orange-400 shrink-0" /> Seus fluxos podem parar de funcionar</li>
              </ul>
            </div>
          )}

          {/* CTA */}
          <div className="mt-6">
            {variant === "welcome" ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <div className="text-sm font-bold text-white">Pronto para começar?</div>
                <div className="mt-1 text-xs text-white/70">Escolha o plano ideal para desbloquear todo o potencial da AgentIA.</div>
                <Button
                  onClick={goPlan}
                  className="mt-3 w-full h-11 rounded-xl bg-gradient-to-r from-sky-500 via-indigo-500 to-fuchsia-500 hover:opacity-95 shadow-lg shadow-indigo-500/30 font-semibold"
                >
                  {cta}
                </Button>
                <div className="mt-2 text-[10px] text-white/50">🔒 Pagamento seguro • Cancelamento fácil</div>
              </div>
            ) : (
              <Button
                onClick={goPlan}
                className="w-full h-12 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:opacity-95 shadow-lg shadow-orange-500/30 font-semibold text-base"
              >
                <Rocket className="h-4 w-4 mr-2" /> {cta}
              </Button>
            )}
          </div>

          <div className="mt-4 text-[10px] text-white/40">🔒 Pagamento 100% seguro</div>
          <div className="mt-4 border-t border-white/5 pt-3 text-[10px] tracking-widest text-white/40">
            AGENTIA — Inteligência que impulsiona resultados.
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Feature({ icon: Icon, title, desc, tint }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; tint: "sky" | "fuchsia" | "emerald" | "orange" }) {
  const tints: Record<string, string> = {
    sky: "bg-sky-500/15 text-sky-300 ring-sky-400/30",
    fuchsia: "bg-fuchsia-500/15 text-fuchsia-300 ring-fuchsia-400/30",
    emerald: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
    orange: "bg-orange-500/15 text-orange-300 ring-orange-400/30",
  };
  return (
    <div className="flex items-start gap-2">
      <div className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ring-1 ${tints[tint]}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold text-white truncate">{title}</div>
        <div className="text-[10px] text-white/60 leading-tight">{desc}</div>
      </div>
    </div>
  );
}