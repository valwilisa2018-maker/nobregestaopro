import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatCurrency } from "@/lib/format";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { ChartTheme } from "./dashboard-charts-overview";

export interface MonthChartPoint {
  mes: string;
  total: number;
}

export interface GoalRow {
  label: string;
  v: number;
  g: number;
}

interface MonthlyChartAndGoalsProps {
  monthChart: MonthChartPoint[];
  chartTheme: ChartTheme;
  goalRows: GoalRow[];
}

export function MonthlyChartAndGoals({
  monthChart,
  chartTheme,
  goalRows,
}: MonthlyChartAndGoalsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Vendas por mês</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthChart} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="barFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartTheme.primaryGlow} stopOpacity={1} />
                  <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.85} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="mes" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
              <YAxis stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  background: chartTheme.tooltipBg,
                  border: `1px solid ${chartTheme.tooltipBorder}`,
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                }}
                formatter={(v: any) => formatCurrency(Number(v))}
              />
              <Bar dataKey="total" fill="url(#barFill)" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Metas</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {goalRows.map((m) => (
            <div key={m.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-muted-foreground">{m.label}</span>
                <span className="font-medium">
                  {m.g ? Math.min(100, Math.round((m.v / m.g) * 100)) : 0}%
                </span>
              </div>
              <Progress value={m.g ? Math.min(100, (m.v / m.g) * 100) : 0} className="h-2" />
              <div className="text-[11px] text-muted-foreground mt-1">
                {formatCurrency(m.v)} {m.g ? `/ ${formatCurrency(m.g)}` : ""}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
