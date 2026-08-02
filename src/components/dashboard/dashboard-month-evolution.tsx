import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { ChartTheme } from "./dashboard-charts-overview";

export interface MonthDeliveryPoint {
  dia: string;
  dayNum: number;
  entregues: number;
  total: number | null;
}

interface MonthEvolutionChartProps {
  monthDeliverySeries: MonthDeliveryPoint[];
  monthDeliveredTotal: number;
  chartTheme: ChartTheme;
}

export function MonthEvolutionChart({
  monthDeliverySeries,
  monthDeliveredTotal,
  chartTheme,
}: MonthEvolutionChartProps) {
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Evolução do mês
          </CardTitle>
          <div className="text-xs text-muted-foreground">
            <span className="font-bold text-foreground">{monthDeliveredTotal}</span> vídeos
            entregues
          </div>
        </div>
      </CardHeader>
      <CardContent className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={monthDeliverySeries} margin={{ left: -10, right: 8, top: 6, bottom: 0 }}>
            <defs>
              <linearGradient id="prodMonthFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.55} />
                <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
            <XAxis
              dataKey="dia"
              stroke={chartTheme.axis}
              tick={{ fontSize: 11 }}
              interval="preserveStartEnd"
            />
            <YAxis stroke={chartTheme.axis} tick={{ fontSize: 11 }} allowDecimals={false} />
            <Tooltip
              contentStyle={{
                background: chartTheme.tooltipBg,
                border: `1px solid ${chartTheme.grid}`,
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: any, name: any) => [v, name === "total" ? "Acumulado" : "No dia"]}
              labelFormatter={(l) => `Dia ${l}`}
            />
            <Area
              type="monotone"
              dataKey="total"
              stroke={chartTheme.primary}
              strokeWidth={2}
              fill="url(#prodMonthFill)"
              connectNulls={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
