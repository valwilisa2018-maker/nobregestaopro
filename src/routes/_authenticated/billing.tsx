import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Check, Loader2, Zap, Rocket, Briefcase, Building2, Crown, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { PlanStatusCard } from "@/components/plan-status";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Meu Plano — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  price_annual_cents: number;
  tokens_included: number;
  features: string[];
  highlight: boolean;
  sort_order: number;
  is_active: boolean;
};

const formatBRL = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const formatTokens = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi de créditos`;
  if (n >= 1_000) return `${(n / 1_000).toLocaleString("pt-BR")} mil créditos`;
  return `${n} créditos`;
};

const iconForPlan = (name: string): LucideIcon => {
  const n = name.toLowerCase();
  if (n.includes("start") || n.includes("inicial") || n.includes("basic")) return Rocket;
  if (n.includes("pro")) return Briefcase;
  if (n.includes("business") || n.includes("empresarial")) return Building2;
  if (n.includes("enterprise") || n.includes("premium") || n.includes("ultimate")) return Crown;
  return Zap;
};

function Page() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<"monthly" | "annual">("monthly");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("plans").select("*").eq("is_active", true).order("sort_order", { ascending: true });
      setLoading(false);
      if (error) return toast.error(error.message);
      setPlans((data ?? []).map((p) => ({
        ...(p as Plan),
        features: Array.isArray((p as { features: unknown }).features) ? (p as Plan).features : [],
      })));
    })();
  }, []);

  return (
    <PageShell
      title="Meu Plano"
      description="Escolha o plano ideal para sua operação."
      icon={<CreditCard className="h-6 w-6" />}
      status="ativo"
    >
      <PlanStatusCard />
      <div className="flex justify-center mb-8">
        <div className="flex items-center gap-1 bg-card/60 border border-border p-1 rounded-full">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-5 py-1.5 rounded-full text-sm font-semibold transition ${
              cycle === "monthly" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "text-muted-foreground hover:text-foreground"
            }`}
          >Mensal</button>
          <button
            onClick={() => setCycle("annual")}
            className={`px-5 py-1.5 rounded-full text-sm font-semibold transition inline-flex items-center gap-2 ${
              cycle === "annual" ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/25" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual
            <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cycle === "annual" ? "bg-white/15 text-white border-white/20" : "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"}`}>-2 meses</span>
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : plans.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum plano disponível.</CardContent></Card>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4 pt-6 items-stretch">
          {plans.map((p) => {
            const annualFromMonthly = p.price_cents * 12;
            const showAnnual = cycle === "annual" && p.price_annual_cents > 0;
            const price = showAnnual ? p.price_annual_cents : p.price_cents;
            const suffix = showAnnual ? "/ano" : "/mês";
            const savings = showAnnual ? annualFromMonthly - p.price_annual_cents : 0;
            const savingsPct = showAnnual && annualFromMonthly > 0 ? Math.round((savings / annualFromMonthly) * 100) : 0;
            const [reais, cents] = (price / 100).toFixed(2).split(".");
            const reaisFmt = Number(reais).toLocaleString("pt-BR");
            return (
            <div
              key={p.id}
              style={{ animationDelay: `${plans.indexOf(p) * 80}ms`, animationFillMode: "both" }}
              className={`group relative flex flex-col p-6 rounded-2xl overflow-hidden transition-all duration-300 ease-out animate-fade-in hover:-translate-y-1.5 hover:shadow-xl ${
                p.highlight
                  ? "bg-gradient-to-b from-emerald-500/10 via-card to-card border-2 border-emerald-500/60 shadow-lg shadow-emerald-500/10 hover:shadow-emerald-500/30"
                  : "bg-gradient-to-b from-primary/[0.06] via-card to-card border border-border hover:border-primary/40 hover:shadow-primary/10"
              }`}
            >
              {/* subtle top glow */}
              <div
                className={`pointer-events-none absolute inset-x-0 -top-24 h-40 opacity-60 blur-2xl ${
                  p.highlight ? "bg-emerald-500/20" : "bg-primary/10"
                }`}
              />
              {p.highlight && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest px-3 py-1 rounded-full shadow-lg shadow-emerald-500/30">
                  Mais vendido
                </div>
              )}

              {/* Header */}
              <div className="relative flex justify-between items-start">
                <h3 className={`text-base font-bold ${p.highlight ? "text-foreground" : "text-foreground/80"}`}>{p.name}</h3>
                {p.highlight && <Zap className="w-5 h-5 text-emerald-400" fill="currentColor" />}
              </div>
              <p className="relative text-xs text-muted-foreground mt-1.5 leading-relaxed min-h-[32px]">
                {p.description || "\u00A0"}
              </p>

              {/* Price */}
              <div className="relative mt-4 min-h-[80px]">
                <div className="flex items-baseline gap-1">
                  <span className="text-xl font-bold text-foreground/80">R$</span>
                  <span className="text-4xl font-black tracking-tight leading-none text-foreground">
                    {reaisFmt}
                    <span className="text-2xl text-foreground/70">,{cents}</span>
                  </span>
                  <span className="text-muted-foreground text-xs ml-1">{suffix}</span>
                </div>
                <div className="mt-2 h-5">
                  {showAnnual && savings > 0 && (
                    <div className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold">
                      Economize {formatBRL(savings)} ({savingsPct}%)
                    </div>
                  )}
                </div>
              </div>

              {/* Divider */}
              <div className="relative my-4 h-px bg-border/60" />

              {/* Credits */}
              <div className="relative py-1.5 px-3 rounded-lg w-fit border bg-emerald-500/10 border-emerald-500/30">
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                  {formatTokens(p.tokens_included)}
                </span>
              </div>

              {/* Features */}
              <ul className="relative mt-4 space-y-2 flex-grow">
                {p.features.map((f, i) => (
                  <li key={i} className={`flex items-start gap-2 text-xs ${p.highlight ? "text-foreground/90" : "text-muted-foreground"}`}>
                    <Check className={`w-4 h-4 shrink-0 mt-0.5 ${p.highlight ? "text-emerald-400" : "text-primary/80"}`} strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`relative mt-6 w-full py-2.5 h-auto rounded-xl font-bold text-sm transition-all ${
                  p.highlight
                    ? "bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30 active:scale-95"
                    : "bg-transparent border border-border text-foreground hover:bg-muted/60"
                }`}
              >
                {p.highlight ? "Assinar Agora" : "Assinar"}
              </Button>
            </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
