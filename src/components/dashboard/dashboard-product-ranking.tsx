import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrency } from "@/lib/format";
import { Package } from "lucide-react";
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

export interface ProductRankingItem {
  name: string;
  total: number;
  qtd: number;
}

interface ProductRankingCardProps {
  currentLabel: string;
  productRanking: ProductRankingItem[];
  chartTheme: ChartTheme;
  onSelectProduct: (name: string) => void;
}

export function ProductRankingCard({
  currentLabel,
  productRanking,
  chartTheme,
  onSelectProduct,
}: ProductRankingCardProps) {
  return (
    <Card
      className="border-border/50 hover:border-primary/40 transition"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Package className="w-4 h-4 text-primary" />
            Produtos / serviços mais vendidos ({currentLabel})
          </CardTitle>
          <Badge variant="outline">{productRanking.length}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {productRanking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem vendas registradas no período.</p>
        ) : (
          <>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={productRanking}
                  layout="vertical"
                  margin={{ left: 12, right: 16, top: 8, bottom: 0 }}
                  onClick={(e: any) => {
                    const name = e?.activePayload?.[0]?.payload?.name;
                    if (name) onSelectProduct(name);
                  }}
                >
                  <defs>
                    <linearGradient id="prodBar" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={chartTheme.primary} stopOpacity={0.95} />
                      <stop offset="100%" stopColor={chartTheme.primaryGlow} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} horizontal={false} />
                  <XAxis type="number" stroke={chartTheme.axis} tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={chartTheme.axis}
                    tick={{ fontSize: 11 }}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      background: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: 8,
                      color: "var(--popover-foreground)",
                    }}
                    formatter={(v: any, _n, p: any) => [
                      `${formatCurrency(Number(v))} • ${p?.payload?.qtd ?? 0} vendas`,
                      "Total",
                    ]}
                  />
                  <Bar
                    dataKey="total"
                    fill="url(#prodBar)"
                    radius={[0, 6, 6, 0]}
                    className="cursor-pointer"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="grid sm:grid-cols-2 gap-2">
              {productRanking.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => onSelectProduct(p.name)}
                  className="flex items-center justify-between p-2 rounded-md bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer text-sm"
                >
                  <span className="font-medium truncate">{p.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {p.qtd} • {formatCurrency(p.total)}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
