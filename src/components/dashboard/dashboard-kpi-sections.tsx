import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { StatCard } from "@/components/stat-card";
import { formatCurrency } from "@/lib/format";
import {
  DollarSign,
  TrendingUp,
  Calendar,
  Trophy,
  AlertCircle,
  Package,
  FileCheck2,
  ListTodo,
  Truck,
  ShoppingCart,
  Factory,
  Clock,
} from "lucide-react";

interface CurrentScope {
  total: number;
  count: number;
  goal: number;
  label: string;
  icon: LucideIcon;
}

interface TodayHeroCardsProps {
  current: CurrentScope;
  scopePct: number;
  weekTotal: number;
  weekCount: number;
  weekGoal: number;
}

export function TodayHeroCards({
  current,
  scopePct,
  weekTotal,
  weekCount,
  weekGoal,
}: TodayHeroCardsProps) {
  const pct = weekGoal ? Math.min(100, Math.round((weekTotal / weekGoal) * 100)) : 0;
  const missing = Math.max(0, weekGoal - weekTotal);
  const Icon = current.icon;
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card
        className="lg:col-span-2 relative overflow-hidden border-success/30 bg-gradient-to-br from-success/15 via-card to-card"
        style={{ boxShadow: "0 10px 40px -10px oklch(0.65 0.18 145 / 0.35)" }}
      >
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full bg-success/25 blur-3xl pointer-events-none" />
        <CardContent className="relative p-6 sm:p-8">
          <div className="flex items-center gap-2 text-success">
            <Icon className="w-5 h-5" />
            <span className="text-sm font-semibold uppercase tracking-wider">
              Vendas — {current.label}
            </span>
          </div>
          <div className="mt-3 text-4xl sm:text-6xl font-extrabold tracking-tight text-foreground">
            {formatCurrency(current.total)}
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            {current.count} {current.count === 1 ? "venda" : "vendas"} no período
          </div>
          <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
            <span>Meta {formatCurrency(current.goal)}</span>
            <span className="font-semibold text-foreground">{scopePct}%</span>
          </div>
          <Progress value={scopePct} className="h-2 mt-2 [&>div]:bg-success" />
        </CardContent>
      </Card>

      <Card
        className="relative overflow-hidden border-info/30 bg-gradient-to-br from-info/15 via-card to-card"
        style={{ boxShadow: "0 10px 40px -10px oklch(0.62 0.18 240 / 0.35)" }}
      >
        <div className="absolute -top-12 -right-12 w-48 h-48 rounded-full bg-info/25 blur-3xl pointer-events-none" />
        <CardHeader className="pb-2 relative">
          <CardTitle className="text-base flex items-center gap-2 text-info">
            <Calendar className="w-4 h-4" />
            <span className="uppercase tracking-wider text-xs font-semibold">Meta da semana</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="relative">
          <div className="text-3xl font-extrabold tracking-tight text-foreground">
            {formatCurrency(weekTotal)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {weekCount} {weekCount === 1 ? "venda" : "vendas"} na semana
          </div>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span>Meta {formatCurrency(weekGoal)}</span>
            <span className="font-bold text-info">{pct}%</span>
          </div>
          <Progress value={pct} className="h-2 mt-2 [&>div]:bg-info" />
          <div className="mt-3 text-xs">
            {weekGoal === 0 ? (
              <span className="text-muted-foreground">
                Defina a meta semanal nas configurações
              </span>
            ) : missing > 0 ? (
              <span className="text-muted-foreground">
                Faltam{" "}
                <span className="font-semibold text-foreground">{formatCurrency(missing)}</span>{" "}
                para bater a meta
              </span>
            ) : (
              <span className="font-semibold text-success">🎯 Meta da semana batida!</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ReceivablesCardsProps {
  scopePeriodLabel: string;
  sinalScope: number;
  scopeSalesCount: number;
  recebPendentesScope: number;
  receiptsScopeCount: number;
  totalRecebidoScope: number;
}

export function ReceivablesCards({
  scopePeriodLabel,
  sinalScope,
  scopeSalesCount,
  recebPendentesScope,
  receiptsScopeCount,
  totalRecebidoScope,
}: ReceivablesCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-1 md:grid-cols-3">
      <StatCard
        tone="success"
        label={`Sinal · ${scopePeriodLabel}`}
        value={formatCurrency(sinalScope)}
        icon={DollarSign}
        hint={`${scopeSalesCount} ${scopeSalesCount === 1 ? "venda" : "vendas"} no período`}
      />
      <StatCard
        tone="info"
        label={`Receb. pendentes · ${scopePeriodLabel}`}
        value={formatCurrency(recebPendentesScope)}
        icon={Clock}
        hint={`${receiptsScopeCount} ${receiptsScopeCount === 1 ? "recebimento" : "recebimentos"} de vendas anteriores`}
      />
      <StatCard
        tone="primary"
        label={`Total · ${scopePeriodLabel}`}
        value={formatCurrency(totalRecebidoScope)}
        icon={TrendingUp}
        accent
        hint="Sinal + Recebimentos pendentes"
      />
    </div>
  );
}

interface MainKpiCardsProps {
  weekTotal: number;
  weekCount: number;
  monthTotal: number;
  monthCount: number;
  ticketMedio: number;
  yearTotal: number;
  pendingTotal: number;
  pendingCount: number;
}

export function MainKpiCards({
  weekTotal,
  weekCount,
  monthTotal,
  monthCount,
  ticketMedio,
  yearTotal,
  pendingTotal,
  pendingCount,
}: MainKpiCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      <StatCard
        tone="info"
        label="Semana"
        value={formatCurrency(weekTotal)}
        icon={Calendar}
        hint={`${weekCount} vendas`}
      />
      <StatCard
        tone="violet"
        label="Mês"
        value={formatCurrency(monthTotal)}
        icon={TrendingUp}
        hint={`${monthCount} vendas`}
      />
      <StatCard
        tone="amber"
        label="Ticket médio"
        value={formatCurrency(ticketMedio)}
        icon={ShoppingCart}
        hint="no mês"
      />
      <StatCard tone="warning" label="Ano" value={formatCurrency(yearTotal)} icon={Trophy} />
      <StatCard
        tone="warning"
        label="Valores Pendentes"
        value={formatCurrency(pendingTotal)}
        icon={AlertCircle}
        hint={`${pendingCount} ${pendingCount === 1 ? "cliente" : "clientes"}`}
      />
    </div>
  );
}

interface ProductionKpiCardsProps {
  ordersTodo: number;
  ordersInProd: number;
  ordersDelivered: number;
  recordingDelivered: number;
  recordingTotal: number;
  invIssued: number;
  invTotal: number;
  invPending: number;
  onNavigateToKanban: () => void;
}

export function ProductionKpiCards({
  ordersTodo,
  ordersInProd,
  ordersDelivered,
  recordingDelivered,
  recordingTotal,
  invIssued,
  invTotal,
  invPending,
  onNavigateToKanban,
}: ProductionKpiCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-5">
      <button
        type="button"
        onClick={onNavigateToKanban}
        className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <StatCard tone="warning" label="Serviços a fazer" value={String(ordersTodo)} icon={ListTodo} />
      </button>
      <button
        type="button"
        onClick={onNavigateToKanban}
        className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <StatCard tone="info" label="Em produção" value={String(ordersInProd)} icon={Package} />
      </button>
      <button
        type="button"
        onClick={onNavigateToKanban}
        className="text-left transition-transform hover:scale-[1.02] active:scale-[0.98]"
      >
        <StatCard tone="success" label="Entregues" value={String(ordersDelivered)} icon={Truck} />
      </button>
      <StatCard
        tone="primary"
        label="Gravação Influencer"
        value={`${recordingDelivered} / ${recordingTotal}`}
        icon={Factory}
        hint={`${recordingTotal - recordingDelivered} aguardando`}
      />
      <StatCard
        tone="violet"
        label="Notas emitidas"
        value={`${invIssued} / ${invTotal}`}
        icon={FileCheck2}
        hint={`${invPending} aguardando`}
      />
    </div>
  );
}
