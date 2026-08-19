import { Deal, Stage, formatBRL } from "./types";
import { TrendingUp, Target, DollarSign, Award, XCircle, Users } from "lucide-react";

export function PipelineStats({ deals, stages }: { deals: Deal[]; stages: Stage[] }) {
  const wonStages = new Set(stages.filter((s) => s.is_won).map((s) => s.id));
  const lostStages = new Set(stages.filter((s) => s.is_lost).map((s) => s.id));
  const won = deals.filter((d) => wonStages.has(d.stage_id));
  const lost = deals.filter((d) => lostStages.has(d.stage_id));
  const active = deals.filter((d) => !wonStages.has(d.stage_id) && !lostStages.has(d.stage_id));
  const closed = won.length + lost.length;
  const conversion = closed > 0 ? Math.round((won.length / closed) * 100) : 0;
  const forecast = active.reduce((s, d) => s + (d.value_cents || 0), 0);
  const revenue = won.reduce((s, d) => s + (d.value_cents || 0), 0);
  const ticket = won.length > 0 ? revenue / won.length : 0;

  const items = [
    {
      label: "Leads Ativos",
      value: active.length,
      icon: Users,
      glow: "from-blue-500/40 to-indigo-500/20",
      ring: "ring-blue-400/30",
      text: "text-blue-300",
    },
    {
      label: "Conversão",
      value: `${conversion}%`,
      icon: TrendingUp,
      glow: "from-emerald-500/40 to-teal-500/20",
      ring: "ring-emerald-400/30",
      text: "text-emerald-300",
    },
    {
      label: "Ticket Médio",
      value: formatBRL(ticket),
      icon: Target,
      glow: "from-violet-500/40 to-fuchsia-500/20",
      ring: "ring-violet-400/30",
      text: "text-violet-300",
    },
    {
      label: "Receita Prevista",
      value: formatBRL(forecast),
      icon: DollarSign,
      glow: "from-amber-500/40 to-orange-500/20",
      ring: "ring-amber-400/30",
      text: "text-amber-300",
    },
    {
      label: "Vendas Ganhas",
      value: formatBRL(revenue),
      icon: Award,
      glow: "from-green-500/40 to-emerald-500/20",
      ring: "ring-green-400/30",
      text: "text-green-300",
    },
    {
      label: "Perdidos",
      value: lost.length,
      icon: XCircle,
      glow: "from-red-500/40 to-rose-500/20",
      ring: "ring-red-400/30",
      text: "text-red-300",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
      {items.map((i) => (
        <div
          key={i.label}
          className={`group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/60 to-slate-950/80 p-4 shadow-[0_10px_30px_-15px_rgba(0,0,0,0.6)] backdrop-blur-xl transition-all hover:-translate-y-0.5 hover:border-white/20 hover:shadow-[0_20px_45px_-15px_rgba(0,0,0,0.7)]`}
        >
          <div
            className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full bg-gradient-to-br ${i.glow} blur-2xl opacity-70 transition-opacity group-hover:opacity-100`}
          />
          <div className="relative flex items-center gap-2">
            <div
              className={`grid h-8 w-8 place-items-center rounded-xl bg-white/[0.04] ring-1 ${i.ring}`}
            >
              <i.icon className={`h-4 w-4 ${i.text}`} />
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {i.label}
            </div>
          </div>
          <div className="relative mt-2 truncate text-xl font-bold tracking-tight text-foreground">
            {i.value}
          </div>
        </div>
      ))}
    </div>
  );
}
