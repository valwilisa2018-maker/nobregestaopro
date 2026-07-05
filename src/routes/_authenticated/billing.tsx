import { createFileRoute } from "@tanstack/react-router";
import { CreditCard, Check, Star, Loader2 } from "lucide-react";
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {plans.map((p) => {
            const annualFromMonthly = p.price_cents * 12;
            const showAnnual = cycle === "annual" && p.price_annual_cents > 0;
            const price = showAnnual ? p.price_annual_cents : p.price_cents;
            const suffix = showAnnual ? "/ano" : "/mês";
            const savings = showAnnual ? annualFromMonthly - p.price_annual_cents : 0;
            const savingsPct = showAnnual && annualFromMonthly > 0 ? Math.round((savings / annualFromMonthly) * 100) : 0;
            return (
            <Card key={p.id} className={`relative flex flex-col ${p.highlight ? "border-primary ring-2 ring-primary/30" : ""}`}>
              {p.highlight && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 gap-1">
                  <Star className="h-3 w-3" /> Mais vendido
                </Badge>
              )}
              <CardContent className="p-6 flex-1 flex flex-col gap-4">
                <div>
                  <h3 className="text-xl font-bold">{p.name}</h3>
                  {p.description && <p className="text-xs text-muted-foreground mt-1">{p.description}</p>}
                </div>
                <div>
                  <div className="text-3xl font-black">{formatBRL(price)}<span className="text-sm text-muted-foreground font-normal">{suffix}</span></div>
                  {showAnnual && savings > 0 && (
                    <div className="text-xs text-emerald-500 font-medium mt-1">
                      Economize {formatBRL(savings)} ({savingsPct}%) vs mensal
                    </div>
                  )}
                  <div className="text-xs text-primary font-medium mt-1">{formatTokens(p.tokens_included)} / mês</div>
                </div>
                <ul className="space-y-1.5 text-sm flex-1">
                  {p.features.map((f, i) => (
                    <li key={i} className="flex gap-2"><Check className="h-4 w-4 text-primary shrink-0 mt-0.5" /><span>{f}</span></li>
                  ))}
                </ul>
                <Button className="w-full" variant={p.highlight ? "default" : "outline"}>Assinar</Button>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
