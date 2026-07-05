import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Check, Loader2, Rocket, Sparkles, Zap } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
      <div className="flex justify-center mb-6">
        <Tabs value={cycle} onValueChange={(v) => setCycle(v as "monthly" | "annual")}>
          <TabsList>
            <TabsTrigger value="monthly">Mensal</TabsTrigger>
            <TabsTrigger value="annual" className="gap-2">Anual <Badge variant="secondary" className="text-[10px]">-2 meses</Badge></TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : plans.length === 0 ? (
        <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum plano disponível.</CardContent></Card>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4 pt-6">
          {plans.map((p) => {
            const annualFromMonthly = p.price_cents * 12;
            const showAnnual = cycle === "annual" && p.price_annual_cents > 0;
            const price = showAnnual ? p.price_annual_cents : p.price_cents;
            const suffix = showAnnual ? "/ano" : "/mês";
            const savings = showAnnual ? annualFromMonthly - p.price_annual_cents : 0;
            const savingsPct = showAnnual && annualFromMonthly > 0 ? Math.round((savings / annualFromMonthly) * 100) : 0;
            return (
            <div key={p.id} className="relative group">
              {p.highlight && (
                <div
                  aria-hidden
                  className="absolute -inset-0.5 rounded-2xl opacity-70 blur-lg transition duration-500 group-hover:opacity-100"
                  style={{ background: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.35) 60%, transparent 100%)" }}
                />
              )}
              <Card
                className={`relative flex flex-col overflow-hidden rounded-2xl border-border/60 bg-card/80 backdrop-blur transition-transform duration-300 group-hover:-translate-y-1 ${
                  p.highlight ? "border-primary/60 shadow-[0_20px_60px_-25px_hsl(var(--primary)/0.6)]" : "hover:border-primary/40"
                }`}
              >
                {p.highlight && (
                  <div className="absolute -top-px left-1/2 -translate-x-1/2 z-10">
                    <div className="flex items-center gap-1.5 rounded-b-lg bg-gradient-to-r from-primary to-primary/70 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-primary-foreground shadow-lg">
                      <Rocket className="h-3 w-3" /> Mais vendido
                    </div>
                  </div>
                )}
                {/* Ambient header */}
                <div className="relative h-24 overflow-hidden">
                  <div
                    className="absolute inset-0"
                    style={{
                      background: p.highlight
                        ? "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.55) 100%)"
                        : "linear-gradient(135deg, hsl(var(--muted)) 0%, hsl(var(--card)) 100%)",
                    }}
                  />
                  <div
                    className="absolute inset-0 opacity-70"
                    style={{ backgroundImage: "radial-gradient(circle at 25% 20%, rgba(255,255,255,0.35), transparent 55%)" }}
                  />
                  <div className="absolute inset-0 flex items-end justify-between px-5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className={`grid h-10 w-10 place-items-center rounded-xl border backdrop-blur ${p.highlight ? "border-white/30 bg-white/15 text-primary-foreground" : "border-primary/30 bg-primary/10 text-primary"}`}>
                        <Rocket className="h-5 w-5" />
                      </div>
                      <div className={`font-black text-lg tracking-tight ${p.highlight ? "text-primary-foreground" : "text-foreground"}`}>{p.name}</div>
                    </div>
                    <Sparkles className={`h-4 w-4 ${p.highlight ? "text-primary-foreground/80" : "text-primary/60"}`} />
                  </div>
                </div>

                <CardContent className="p-5 flex-1 flex flex-col gap-4">
                  {p.description && <p className="text-xs text-muted-foreground leading-relaxed">{p.description}</p>}

                  <div className="rounded-xl border border-border/60 bg-muted/30 p-4">
                    <div className="flex items-baseline gap-1">
                      <span className="text-4xl font-black tracking-tight bg-clip-text text-transparent"
                        style={{ backgroundImage: "linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--foreground)) 100%)" }}>
                        {formatBRL(price)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">{suffix}</span>
                    </div>
                    {showAnnual && savings > 0 && (
                      <div className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-500">
                        <Zap className="h-3 w-3" /> Economize {formatBRL(savings)} ({savingsPct}%)
                      </div>
                    )}
                    <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-primary">
                      <Sparkles className="h-3 w-3" /> {formatTokens(p.tokens_included)} / mês
                    </div>
                  </div>

                  <ul className="space-y-2 text-sm flex-1">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15">
                          <Check className="h-3 w-3 text-primary" />
                        </span>
                        <span className="text-foreground/90">{f}</span>
                      </li>
                    ))}
                  </ul>

                  <Button
                    className={`w-full h-11 font-bold gap-2 ${p.highlight
                      ? "bg-gradient-to-r from-primary to-primary/80 hover:from-primary hover:to-primary text-primary-foreground shadow-lg shadow-primary/30"
                      : ""}`}
                    variant={p.highlight ? "default" : "outline"}
                  >
                    <Rocket className="h-4 w-4" /> Assinar {p.name}
                  </Button>
                </CardContent>
              </Card>
            </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
