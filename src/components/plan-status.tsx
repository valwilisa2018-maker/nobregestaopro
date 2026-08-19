import { useEffect, useState } from "react";
import { AlertTriangle, Crown } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type PlanStatus = {
  planName: string | null;
  startedAt: Date | null;
  expiresAt: Date | null;
  daysLeft: number | null;
  totalDays: number;
  usedDays: number;
  expiring: boolean;
  expired: boolean;
};

export function usePlanStatus() {
  const [status, setStatus] = useState<PlanStatus | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("plan_started_at, plan_expires_at, plans(name)")
        .eq("id", user.id)
        .maybeSingle();
      if (cancelled || !data) return;
      const startedAt = data.plan_started_at ? new Date(data.plan_started_at) : null;
      const expiresAt = data.plan_expires_at ? new Date(data.plan_expires_at) : null;
      const planName = (data.plans as { name: string } | null)?.name ?? null;
      const now = Date.now();
      const totalDays =
        startedAt && expiresAt
          ? Math.max(1, Math.round((expiresAt.getTime() - startedAt.getTime()) / 86400000))
          : 30;
      const daysLeft = expiresAt ? Math.ceil((expiresAt.getTime() - now) / 86400000) : null;
      const usedDays =
        daysLeft == null ? 0 : Math.min(totalDays, Math.max(0, totalDays - daysLeft));
      setStatus({
        planName,
        startedAt,
        expiresAt,
        daysLeft,
        totalDays,
        usedDays,
        expiring: daysLeft != null && daysLeft <= 3 && daysLeft >= 0,
        expired: daysLeft != null && daysLeft < 0,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return status;
}

export function PlanStatusCard() {
  const s = usePlanStatus();
  if (!s || !s.planName) return null;
  const hasPlan = true;
  const pct = Math.round((s.usedDays / s.totalDays) * 100);
  const warn = s.expiring || s.expired;
  return (
    <Card className={`mb-4 ${warn ? "border-destructive/60" : ""}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-primary" />
            <div>
              <div className="text-xs text-muted-foreground">Plano atual</div>
              <div className="font-bold">{hasPlan ? s.planName : "Nenhum plano ativo"}</div>
            </div>
          </div>
          {hasPlan && s.daysLeft != null && (
            <Badge variant={warn ? "destructive" : "secondary"}>
              {s.expired
                ? "Vencido"
                : `${s.daysLeft} dia${s.daysLeft === 1 ? "" : "s"} restante${s.daysLeft === 1 ? "" : "s"}`}
            </Badge>
          )}
          {!hasPlan && <Badge variant="outline">Escolha um plano abaixo</Badge>}
        </div>
        <div>
          <Progress value={pct} className={warn ? "[&>div]:bg-destructive" : ""} />
          <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
            <span>
              Dia {s.usedDays} de {s.totalDays}
            </span>
            {hasPlan && s.expiresAt ? (
              <span>Vence em {s.expiresAt.toLocaleDateString("pt-BR")}</span>
            ) : (
              <span>Ciclo de 30 dias</span>
            )}
          </div>
        </div>
        {warn && (
          <Alert variant="destructive" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              {s.expired
                ? "Seu plano venceu. Renove para continuar usando."
                : "Seu plano está prestes a vencer. Renove para não perder o acesso."}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

export function PlanExpiryBanner() {
  const s = usePlanStatus();
  if (!s || (!s.expiring && !s.expired)) return null;
  return (
    <div className="bg-destructive/15 border-b border-destructive/40 text-destructive text-sm px-3 py-2 flex items-center gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {s.expired
          ? `Seu plano ${s.planName ?? ""} venceu. Renove para continuar usando a plataforma.`
          : `Atenção: seu plano ${s.planName ?? ""} vence em ${s.daysLeft} dia${s.daysLeft === 1 ? "" : "s"}. Renove agora.`}
      </span>
      <Link to="/billing" className="underline font-semibold shrink-0 hover:opacity-80">
        Renovar plano
      </Link>
    </div>
  );
}
