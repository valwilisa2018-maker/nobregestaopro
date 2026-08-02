import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency } from "@/lib/format";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

export interface ChartTheme {
  grid: string;
  axis: string;
  tooltipBg: string;
  tooltipBorder: string;
  primary: string;
  primaryGlow: string;
}

export interface DailyPoint {
  dia: string;
  total: number;
}

export interface PaymentPieSlice {
  name: string;
  value: number;
  color: string;
}

interface SalesAndPaymentChartsProps {
  last30: DailyPoint[];
  paymentPie: PaymentPieSlice[];
  chartTheme: ChartTheme;
}

export function SalesAndPaymentCharts({
  last30,
  paymentPie,
  chartTheme,
}: SalesAndPaymentChartsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Vendas — últimos 30 dias</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={last30} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.55} />
                  <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} />
              <XAxis dataKey="dia" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
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
              <Area
                type="monotone"
                dataKey="total"
                stroke={chartTheme.primary}
                fill="url(#areaFill)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle>Status de pagamento</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={paymentPie}
                dataKey="value"
                nameKey="name"
                innerRadius={55}
                outerRadius={90}
                paddingAngle={3}
              >
                {paymentPie.map((p, i) => (
                  <Cell key={i} fill={p.color} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: chartTheme.tooltipBg,
                  border: `1px solid ${chartTheme.tooltipBorder}`,
                  borderRadius: 8,
                  color: "var(--popover-foreground)",
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
