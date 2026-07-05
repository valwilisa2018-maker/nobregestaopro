import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Check, Loader2, Zap } from "lucide-react";
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
      <div className="flex justify-center mb-10">
        <div className="flex items-center gap-2 bg-card/60 border border-border p-1.5 rounded-full">
          <button
            onClick={() => setCycle("monthly")}
            className={`px-5 py-1.5 rounded-full text-sm font-semibold transition ${
              cycle === "monthly" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
            }`}
          >Mensal</button>
          <button
            onClick={() => setCycle("annual")}
            className={`px-5 py-1.5 rounded-full text-sm font-semibold transition inline-flex items-center gap-2 ${
              cycle === "annual" ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Anual
            <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20">-2 meses</span>
          </button>
        </div>
      </div>
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : plans.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum plano disponível.</CardContent></Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 pt-6 items-stretch">
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
              className={`group relative flex flex-col p-8 rounded-3xl transition-all ${
                p.highlight
                  ? "bg-card border-2 border-primary shadow-2xl shadow-primary/10 xl:scale-[1.03] z-10"
                  : "bg-card/40 border border-border hover:border-border/80"
              }`}
            >
              {p.highlight && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                  Mais vendido
                </div>
              )}
              <div className="flex justify-between items-start mb-2">
                <h3 className={`text-lg font-bold ${p.highlight ? "text-foreground" : "text-muted-foreground"}`}>{p.name}</h3>
                {p.highlight && <Zap className="w-6 h-6 text-primary" fill="currentColor" />}
              </div>
              {p.description && <p className="text-sm text-muted-foreground mb-8 leading-relaxed">{p.description}</p>}

              <div className="flex items-baseline gap-1 mb-2">
                <span className={`text-3xl font-bold ${p.highlight ? "text-foreground" : "text-foreground/90"}`}>R$</span>
                <span className={`font-black tracking-tight ${p.highlight ? "text-6xl text-foreground" : "text-5xl text-foreground/90"}`}>
                  {reaisFmt},{cents}
                </span>
                <span className="text-muted-foreground text-sm">{suffix}</span>
              </div>
              {showAnnual && savings > 0 ? (
                <div className="inline-flex w-fit items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold mb-6">
                  Economize {formatBRL(savings)} ({savingsPct}%)
                </div>
              ) : <div className="mb-6" />}

              <div className={`mb-8 py-2 px-4 rounded-xl w-fit border ${
                p.highlight ? "bg-primary/10 border-primary/30" : "bg-muted/40 border-border"
              }`}>
                <span className={`text-xs font-bold uppercase tracking-wider ${p.highlight ? "text-primary" : "text-primary/90"}`}>
                  {formatTokens(p.tokens_included)}
                </span>
              </div>

              <ul className="space-y-4 mb-10 flex-grow">
                {p.features.map((f, i) => (
                  <li key={i} className={`flex items-start gap-3 text-sm ${p.highlight ? "text-foreground/90" : "text-muted-foreground"}`}>
                    <Check className={`w-5 h-5 shrink-0 mt-0.5 ${p.highlight ? "text-primary" : "text-primary/80"}`} strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>

              <Button
                className={`w-full py-4 h-auto rounded-2xl font-black transition-all ${
                  p.highlight
                    ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/30 active:scale-95"
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
