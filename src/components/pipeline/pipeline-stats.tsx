import { Card, CardContent } from "@/components/ui/card";
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
    { label: "Leads Ativos", value: active.length, icon: Users, color: "text-blue-500" },
    { label: "Conversão", value: `${conversion}%`, icon: TrendingUp, color: "text-emerald-500" },
    { label: "Ticket Médio", value: formatBRL(ticket), icon: Target, color: "text-purple-500" },
    { label: "Receita Prevista", value: formatBRL(forecast), icon: DollarSign, color: "text-amber-500" },
    { label: "Vendas Ganhas", value: formatBRL(revenue), icon: Award, color: "text-green-500" },
    { label: "Perdidos", value: lost.length, icon: XCircle, color: "text-red-500" },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {items.map((i) => (
        <Card key={i.label} className="bg-card/60 backdrop-blur border-border/60">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              <i.icon className={`h-3.5 w-3.5 ${i.color}`} /> {i.label}
            </div>
            <div className="text-lg font-bold truncate">{i.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}