import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatCurrency } from "@/lib/format";

export type DrillState =
  | { kind: "seller" | "producer"; id: string; label: string }
  | { kind: "product"; name: string; label: string }
  | null;

interface SaleRow {
  id: string;
  created_at: string;
  customer_id?: string | null;
  seller_id?: string | null;
  producer_id?: string | null;
  package_id?: string | null;
  service_type_id?: string | null;
  total_amount: number | string;
  paid_amount?: number | string | null;
  payment_status: string | null;
}

interface DrillDialogProps {
  drill: DrillState;
  onClose: () => void;
  sales: SaleRow[];
  scopeSince: string;
  scopeLabel: string;
  customers: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  producers: { id: string; name: string }[];
  serviceTypes: { id: string; name: string }[];
  packages: { id: string; name: string }[];
}

export function DrillDialog({
  drill,
  onClose,
  sales,
  scopeSince,
  scopeLabel,
  customers,
  sellers,
  producers,
  serviceTypes,
  packages,
}: DrillDialogProps) {
  const open = !!drill;
  const cName = new Map(customers.map((c) => [c.id, c.name]));
  const sName = new Map(sellers.map((s) => [s.id, s.name]));
  const pName = new Map(producers.map((p) => [p.id, p.name]));
  const stName = new Map(serviceTypes.map((s) => [s.id, s.name]));
  const pkName = new Map(packages.map((p) => [p.id, p.name]));

  const rows = (() => {
    if (!drill) return [] as SaleRow[];
    return sales
      .filter((s) => s.created_at >= scopeSince)
      .filter((s) => {
        if (drill.kind === "seller") return s.seller_id === drill.id;
        if (drill.kind === "producer") return s.producer_id === drill.id;
        const name = s.package_id
          ? (pkName.get(s.package_id) ?? "Pacote")
          : (stName.get(s.service_type_id ?? "") ?? "Outro");
        return name === (drill as { name: string }).name;
      })
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  })();

  const total = rows.reduce((a, r) => a + Number(r.total_amount), 0);
  const paid = rows.reduce((a, r) => a + Number(r.paid_amount ?? 0), 0);

  const kindLabel =
    drill?.kind === "seller"
      ? "Vendedor"
      : drill?.kind === "producer"
        ? "Produtor"
        : "Produto / serviço";

  const statusBadge = (st: string | null) => {
    if (st === "pago_total")
      return <Badge className="bg-success/15 text-success border-success/30">Pago</Badge>;
    if (st === "pago_parcial")
      return <Badge className="bg-warning/15 text-warning border-warning/30">Parcial</Badge>;
    return (
      <Badge className="bg-destructive/15 text-destructive border-destructive/30">Pendente</Badge>
    );
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kindLabel}: <span className="text-primary">{drill?.label}</span>
          </DialogTitle>
          <DialogDescription>
            Vendas no período: <span className="font-semibold text-foreground">{scopeLabel}</span> —{" "}
            {rows.length} {rows.length === 1 ? "venda" : "vendas"} • Total {formatCurrency(total)} •
            Recebido {formatCurrency(paid)}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[60vh] overflow-y-auto rounded-md border border-border">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">
              Nenhuma venda encontrada no período.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur">
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="p-2 font-medium">Data</th>
                  <th className="p-2 font-medium">Cliente</th>
                  <th className="p-2 font-medium">Serviço</th>
                  {drill?.kind !== "seller" && <th className="p-2 font-medium">Vendedor</th>}
                  {drill?.kind !== "producer" && <th className="p-2 font-medium">Produtor</th>}
                  <th className="p-2 font-medium text-right">Valor</th>
                  <th className="p-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const svc = r.package_id
                    ? (pkName.get(r.package_id) ?? "Pacote")
                    : (stName.get(r.service_type_id ?? "") ?? "—");
                  return (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/40">
                      <td className="p-2 whitespace-nowrap">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      <td className="p-2">{r.customer_id ? (cName.get(r.customer_id) ?? "—") : "—"}</td>
                      <td className="p-2">{svc}</td>
                      {drill?.kind !== "seller" && (
                        <td className="p-2">{r.seller_id ? (sName.get(r.seller_id) ?? "—") : "—"}</td>
                      )}
                      {drill?.kind !== "producer" && (
                        <td className="p-2">{r.producer_id ? (pName.get(r.producer_id) ?? "—") : "—"}</td>
                      )}
                      <td className="p-2 text-right font-semibold">
                        {formatCurrency(Number(r.total_amount))}
                      </td>
                      <td className="p-2">{statusBadge(r.payment_status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
