import { createFileRoute, useNavigate } from "@tanstack/react-router";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2, History } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/pending-payments")({
  component: PendingPaymentsPage,
});

function PendingPaymentsPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
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
        .select("id, sale_date, total_amount, paid_amount, payment_status, notes, receipt_url, seller_id, producer_id, customer:customers(id, name, company, phone, email), seller:sellers(id, name), producer:producers(id, name)")
        .in("payment_status", ["pendente", "pago_parcial"])
        .order("sale_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [producerFilter, setProducerFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const sellersList = useMemo(() => {
    const map = new Map<string, string>();
    (q.data ?? []).forEach((s: any) => { if (s.seller?.id) map.set(s.seller.id, s.seller.name); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);
  const producersList = useMemo(() => {
    const map = new Map<string, string>();
    (q.data ?? []).forEach((s: any) => { if (s.producer?.id) map.set(s.producer.id, s.producer.name); });
    return Array.from(map, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [q.data]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (q.data ?? []).filter((s: any) => {
      const remaining = Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0);
      if (remaining <= 0) return false;
      if (sellerFilter !== "all" && s.seller?.id !== sellerFilter) return false;
      if (producerFilter !== "all" && s.producer?.id !== producerFilter) return false;
      if (dateFrom && s.sale_date < dateFrom) return false;
      if (dateTo && s.sale_date > dateTo) return false;
      if (!term) return true;
      const c = s.customer ?? {};
      return [c.name, c.company, c.phone, c.email, s.seller?.name, s.producer?.name].some((v) =>
        (v ?? "").toString().toLowerCase().includes(term),
      );
    });
  }, [q.data, search, sellerFilter, producerFilter, dateFrom, dateTo]);

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

      if (file && receipt_url) {
        await supabase.from("sale_receipts").insert({
          sale_id: selected.id,
          file_path: receipt_url,
          amount: value,
          paid_at: new Date().toISOString().slice(0, 10),
          uploaded_by: user?.id ?? null,
        });
      }

      const customerName = selected.customer?.name;
      toast.success("Recebimento confirmado", {
        action: {
          label: "Ver Histórico",
          onClick: () => {
            navigate({ to: "/customers", search: { search: customerName } });
          },
        },
        description: `O comprovante foi salvo e o saldo do cliente atualizado.`
      });
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
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-8" placeholder="Buscar cliente, empresa, vendedor..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={sellerFilter} onValueChange={setSellerFilter}>
              <SelectTrigger><SelectValue placeholder="Vendedor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos vendedores</SelectItem>
                {sellersList.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={producerFilter} onValueChange={setProducerFilter}>
              <SelectTrigger><SelectValue placeholder="Produtor" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos produtores</SelectItem>
                {producersList.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} title="De" />
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} title="Até" />
            </div>
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
                <TableHead>Vendedor</TableHead>
                <TableHead>Produtor</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Pago</TableHead>
                <TableHead className="text-right">Saldo</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {q.isLoading && (
                <TableRow><TableCell colSpan={10} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline" /></TableCell></TableRow>
              )}
              {!q.isLoading && rows.length === 0 && (
                <TableRow><TableCell colSpan={10} className="text-center text-muted-foreground py-8">Nenhum valor pendente</TableCell></TableRow>
              )}
              {rows.map((s: any) => {
                const remaining = Number(s.total_amount ?? 0) - Number(s.paid_amount ?? 0);
                return (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                    <TableCell className="font-medium">{s.customer?.name ?? "—"}</TableCell>
                    <TableCell>{s.customer?.company ?? "—"}</TableCell>
                    <TableCell>{s.seller?.name ?? "—"}</TableCell>
                    <TableCell>{s.producer?.name ?? "—"}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.total_amount)}</TableCell>
                    <TableCell className="text-right">{formatCurrency(s.paid_amount)}</TableCell>
                    <TableCell className="text-right font-semibold text-red-500">{formatCurrency(remaining)}</TableCell>
                    <TableCell>
                      <Badge variant={s.payment_status === "pago_parcial" ? "secondary" : "outline"}>
                        {s.payment_status === "pago_parcial" ? "parcial" : s.payment_status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right flex items-center justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={() => navigate({ to: "/customers", search: { search: s.customer?.name } })}>
                        <History className="w-4 h-4 mr-1" /> Histórico
                      </Button>
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => openDialog(s)}>Confirmar recebimento</Button>
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
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Anexar comprovante e confirmar pagamento</DialogTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                className="text-xs"
                onClick={() => navigate({ to: "/customers", search: { search: selected?.customer?.name } })}
              >
                <History className="w-3.5 h-3.5 mr-1" /> Ver Histórico
              </Button>
            </div>
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
                <Label>Comprovante (Imagem ou PDF)</Label>
                <div 
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${file ? 'border-green-500 bg-green-50' : 'border-gray-200 hover:border-gray-300'}`}
                  onClick={() => document.getElementById('receipt-upload')?.click()}
                >
                  <Input 
                    id="receipt-upload"
                    type="file" 
                    accept="image/*,application/pdf" 
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)} 
                  />
                  {file ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-green-700">{file.name}</p>
                      <p className="text-xs text-green-600">Clique para trocar o arquivo</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Clique para selecionar ou arraste o comprovante aqui</p>
                      <p className="text-xs text-muted-foreground">JPG, PNG ou PDF</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Confirmar valor do pagamento (R$)</Label>
                <Input 
                  type="number" 
                  step="0.01" 
                  min="0" 
                  value={amount} 
                  onChange={(e) => setAmount(e.target.value)} 
                  placeholder="0,00"
                />
              </div>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>Cancelar</Button>
            <Button 
              className="bg-green-600 hover:bg-green-700 text-white" 
              onClick={confirm} 
              disabled={saving || !file || !amount}
            >
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Confirmar Pagamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}