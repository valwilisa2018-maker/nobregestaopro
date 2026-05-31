import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Search, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pending-payments")({
  component: PendingPaymentsPage,
});

function PendingPaymentsPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [amount, setAmount] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["pending-sales"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales")
        .select("id, sale_date, total_amount, paid_amount, payment_status, notes, receipt_url, customer:customers(id, name, company, phone, email)")
        .in("payment_status", ["pendente", "pago_parcial"])
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((s: any) => {
      const remaining = Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0);
      if (remaining <= 0) return false;
      if (!term) return true;
      const c = s.customer ?? {};
      return [c.name, c.company, c.phone, c.email].some((v) =>
        (v ?? "").toString().toLowerCase().includes(term),
      );
    });
  }, [q.data, search]);

  const totalPending = rows.reduce(
    (acc: number, s: any) => acc + (Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0)),
    0,
  );

  const openDialog = (s: any) => {
    setSelected(s);
    const remaining = Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0);
    setAmount(remaining.toFixed(2));
    setFile(null);
  };

  const confirm = async () => {
    if (!selected) return;
    const value = Number(amount);
    if (!value || value <= 0) { toast.error("Informe um valor válido"); return; }
    const remaining = Number(selected.total_amount ?? 0) - Number(selected.paid_amount ?? 0);
    if (value > remaining + 0.01) { toast.error("Valor maior que o saldo devedor"); return; }

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let receipt_url: string | null = selected.receipt_url ?? null;
      if (file) {
        const ext = file.name.split(".").pop() || "bin";
        const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: ue } = await supabase.storage.from("receipts").upload(path, file, {
          contentType: file.type || undefined,
          upsert: false,
        });
        if (ue) throw ue;
        receipt_url = path;
      }
      const newPaid = Number(selected.paid_amount ?? 0) + value;
      const total = Number(selected.total_amount ?? 0);
      const newStatus = newPaid + 0.01 >= total ? "pago_total" : "pago_parcial";

      const { error } = await supabase
        .from("sales")
        .update({ paid_amount: newPaid, payment_status: newStatus as any, receipt_url })
        .eq("id", selected.id);
      if (error) throw error;

      toast.success("Recebimento confirmado");
      setSelected(null);
      setFile(null);
      setAmount("");
      qc.invalidateQueries({ queryKey: ["pending-sales"] });
      qc.invalidateQueries({ queryKey: ["customers-all"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao confirmar recebimento");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Valores Pendentes</h1>
          <p className="text-muted-foreground">Clientes com pagamentos parciais ou em débito</p>
        </div>
        <Card className="border-border/50">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total em aberto</div>
            <div className="text-2xl font-bold text-red-500">{formatCurrency(totalPending)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-4">
          <div className="relative max-w-sm">
            <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-8" placeholder="Buscar cliente..." value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Empresa</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhum valor pendente</TableCell></TableRow>
              )}
              {rows.map((s: any) => {
                const remaining = Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                    <TableCell className="font-medium">{s.customer?.name ?? "—"}</TableCell>
                    <TableCell>{s.customer?.company ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.paid_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-500">{formatCurrency(remaining)}</TableCell>
                    <TableCell>
                      <Badge variant={s.payment_status === "pago_parcial" ? "secondary" : "outline"}>
                        {s.payment_status === "pago_parcial" ? "parcial" : s.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="sm" onClick={() => openDialog(s)}>Confirmar recebimento</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar recebimento parcial</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Total</div>
                  <div className="font-semibold">{formatCurrency(selected.total_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Pago</div>
                  <div className="font-semibold">{formatCurrency(selected.paid_amount)}</div>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Saldo</div>
                  <div className="font-semibold text-red-500">
                    {formatCurrency(Number(selected.total_amount ?? 0) - Number(selected.paid_amount ?? 0))}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Valor recebido (R$)</Label>
                <Input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Comprovante</Label>
                <Input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                {file && <div className="text-xs text-muted-foreground">{file.name}</div>}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>Cancelar</Button>
            <Button onClick={confirm} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar recebimento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}