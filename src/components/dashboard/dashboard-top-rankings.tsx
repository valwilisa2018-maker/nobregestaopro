import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TopVendorBadge } from "@/components/top-vendor-badge";
import { formatCurrency, formatDuracao } from "@/lib/format";
import { Users, Factory } from "lucide-react";

export interface SellerRankingItem {
  id: string;
  name: string;
  total: number;
  qtd: number;
}

export interface ProducerRankingItem {
  id: string;
  name: string;
  entregues: number;
  entreguesHoje: number;
  entreguesMes: number;
  entreguesTotal: number;
  emProducao: number;
  segundosProntos: number;
  pontosProntos: number;
  valorTotal: number;
  qtd: number;
}

interface TopRankingsSectionProps {
  currentLabel: string;
  sellerRanking: SellerRankingItem[];
  producerRanking: ProducerRankingItem[];
  onSelectSeller: (id: string, name: string) => void;
  onSelectProducer: (id: string, name: string) => void;
}

export function TopRankingsSection({
  currentLabel,
  sellerRanking,
  producerRanking,
  onSelectSeller,
  onSelectProducer,
}: TopRankingsSectionProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Users className="w-4 h-4 text-primary" />
              Top Vendedores ({currentLabel})
            </CardTitle>
            <Badge variant="outline">{sellerRanking.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {sellerRanking.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Sem vendas no período para os filtros atuais.
            </p>
          )}
          {sellerRanking.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelectSeller(s.id, s.name)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {i === 0 ? (
                  <TopVendorBadge rank={1} size="sm" />
                ) : (
                  <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-primary/20 text-primary">
                    {i + 1}
                  </div>
                )}
                <div>
                  <div className="font-medium leading-tight">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.qtd} vendas</div>
                </div>
              </div>
              <span className="font-semibold">{formatCurrency(s.total)}</span>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Factory className="w-4 h-4 text-primary" />
              Top Produtores ({currentLabel})
            </CardTitle>
            <Badge variant="outline">{producerRanking.length}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {producerRanking.length === 0 && (
            <p className="text-sm text-muted-foreground">Sem produção no período.</p>
          )}
          {producerRanking.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelectProducer(p.id, p.name)}
              className="w-full flex items-center justify-between p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-primary/40 transition text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                {i === 0 ? (
                  <TopVendorBadge rank={1} size="sm" />
                ) : (
                  <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-primary/20 text-primary">
                    {i + 1}
                  </div>
                )}
                <div>
                  <div className="font-medium leading-tight">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.entreguesMes} vídeo{p.entreguesMes === 1 ? "" : "s"} no mês
                    {p.segundosProntos > 0 ? ` • ${formatDuracao(p.segundosProntos)} prontos` : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {p.entreguesTotal} vídeo{p.entreguesTotal === 1 ? "" : "s"} entregues no total
                    {p.emProducao > 0 ? ` • ${p.emProducao} em produção` : ""}
                  </div>
                  <div className="text-[11px] font-semibold text-emerald-500">
                    Total produzido: {formatCurrency(p.valorTotal)}
                  </div>
                </div>
              </div>
              <div className="flex flex-col items-end leading-tight">
                <span className="font-semibold">
                  {p.entreguesHoje} vídeo{p.entreguesHoje === 1 ? "" : "s"} hoje
                </span>
                <span className="text-[11px] font-semibold text-amber-500">{p.pontosProntos} pts</span>
                <span className="text-[10px] text-muted-foreground">
                  cada 30s = 1 pt
                </span>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
