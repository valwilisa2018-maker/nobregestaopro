import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Factory } from "lucide-react";

export interface InProductionItem {
  id: string;
  name: string;
  emProducao: number;
}

interface InProductionCardProps {
  inProductionRanking: InProductionItem[];
  totalInProduction: number;
  onSelectProducer: (id: string, name: string) => void;
}

export function InProductionCard({
  inProductionRanking,
  totalInProduction,
  onSelectProducer,
}: InProductionCardProps) {
  return (
    <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <Factory className="w-4 h-4 text-amber-500" />
            Em Produção por Produtor
          </CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Total</span>
            <Badge className="bg-amber-500/15 text-amber-500 border-amber-500/30 hover:bg-amber-500/20">
              {totalInProduction} {totalInProduction === 1 ? "vídeo" : "vídeos"}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {inProductionRanking.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum vídeo em produção no momento.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {inProductionRanking.map((p, i) => {
              const max = inProductionRanking[0]?.emProducao || 1;
              const pct = Math.max(6, Math.round((p.emProducao / max) * 100));
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectProducer(p.id, p.name)}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 hover:bg-muted/70 hover:ring-1 hover:ring-amber-500/40 transition text-left cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center bg-amber-500/20 text-amber-500 shrink-0">
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium truncate">{p.name}</span>
                      <span className="text-sm font-bold tabular-nums text-amber-500 shrink-0">
                        {p.emProducao}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
