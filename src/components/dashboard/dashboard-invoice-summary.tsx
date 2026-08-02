import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileCheck2, FileText, AlertCircle } from "lucide-react";

interface InvoiceSummaryCardsProps {
  currentLabel: string;
  scopeSalesWithInvoice: number;
  scopeSalesWithoutInvoice: number;
  pendingPaymentsCount: number;
}

export function InvoiceSummaryCards({
  currentLabel,
  scopeSalesWithInvoice,
  scopeSalesWithoutInvoice,
  pendingPaymentsCount,
}: InvoiceSummaryCardsProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileCheck2 className="w-4 h-4 text-success" />
            Com nota ({currentLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-success">{scopeSalesWithInvoice}</div>
          <div className="text-xs text-muted-foreground mt-1">
            vendas no período já com nota emitida ou registrada
          </div>
        </CardContent>
      </Card>
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-warning" />
            Sem nota ({currentLabel})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-warning">{scopeSalesWithoutInvoice}</div>
          <div className="text-xs text-muted-foreground mt-1">vendas no período ainda sem nota</div>
        </CardContent>
      </Card>
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-destructive" />
            Pagamentos pendentes
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-4xl font-bold text-destructive">{pendingPaymentsCount}</div>
          <div className="text-xs text-muted-foreground mt-1">vendas com status pendente</div>
        </CardContent>
      </Card>
    </div>
  );
}
