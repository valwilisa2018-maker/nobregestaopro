import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Loader2, FileText, Clock, Send, ListTodo, CheckCircle2, XCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/invoices")({
  component: InvoicesPage,
});

const STATUS_META: Record<string, { label: string; icon: any; variant: "default" | "secondary" | "destructive" | "outline"; tone: string }> = {
  a_fazer: { label: "A fazer", icon: ListTodo, variant: "outline", tone: "text-muted-foreground" },
  aguardando_emissao: { label: "Aguardando emissão", icon: Clock, variant: "secondary", tone: "text-amber-500" },
  pronto_para_envio: { label: "Pronto para envio", icon: Send, variant: "secondary", tone: "text-blue-500" },
  pendente: { label: "Pendente", icon: Clock, variant: "secondary", tone: "text-amber-500" },
  emitida: { label: "Emitida", icon: CheckCircle2, variant: "default", tone: "text-success" },
  cancelada: { label: "Cancelada", icon: XCircle, variant: "destructive", tone: "text-destructive" },
};

const STATUS_ORDER = ["a_fazer", "aguardando_emissao", "pronto_para_envio", "emitida", "cancelada"];

function InvoicesPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    customer_id: "", sale_id: "", number: "", amount: "", issued_at: "",
    status: "a_fazer", notes: "",
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await supabase.from("invoices").select("*, customers(name,company)").order("created_at", { ascending: false })).data ?? [],
  });
  const customers = useQuery({
    queryKey: ["invoice-customers"],
    queryFn: async () => (await supabase.from("customers").select("id,name,company,document,email,phone").order("name")).data ?? [],
  });

  const selectedCustomer = useMemo(
    () => (customers.data ?? []).find((c: any) => c.id === form.customer_id),
    [customers.data, form.customer_id]
  );

  const customerSales = useQuery({
    queryKey: ["invoice-customer-sales", form.customer_id],
    enabled: !!form.customer_id,
    queryFn: async () => (await supabase.from("sales").select("id,total_amount,sale_date,service_quantity").eq("customer_id", form.customer_id).order("sale_date", { ascending: false })).data ?? [],
  });

  // Auto-preencher valor com a soma das vendas do cliente quando seleciona
  const onSelectCustomer = (id: string) => {
    setForm((f) => ({ ...f, customer_id: id, sale_id: "", amount: "" }));
  };

  const applySale = (saleId: string) => {
    const sale = (customerSales.data ?? []).find((s: any) => s.id === saleId);
    setForm((f) => ({
      ...f,
      sale_id: saleId,
      amount: sale ? String(sale.total_amount) : f.amount,
    }));
  };

  const applyAllSales = () => {
    const total = (customerSales.data ?? []).reduce((sum: number, s: any) => sum + Number(s.total_amount ?? 0), 0);
    setForm((f) => ({ ...f, sale_id: "", amount: total ? String(total) : f.amount }));
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (invoices.data ?? []).forEach((i: any) => { c[i.status] = (c[i.status] ?? 0) + 1; });
    return c;
  }, [invoices.data]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (invoices.data ?? []).filter((i: any) => {
      if (filter !== "all" && i.status !== filter) return false;
      if (!s) return true;
      return (
        (i.number ?? "").toLowerCase().includes(s) ||
        (i.customers?.name ?? "").toLowerCase().includes(s) ||
        (i.customers?.company ?? "").toLowerCase().includes(s)
      );
    });
  }, [invoices.data, filter, search]);

  const submit = async () => {
    if (!form.customer_id || !form.amount) { toast.error("Cliente e valor são obrigatórios"); return; }
    setSaving(true);
    try {
      const { error } = await supabase.from("invoices").insert({
        customer_id: form.customer_id,
        sale_id: form.sale_id || null,
        number: form.number || null,
        amount: Number(form.amount),
        issued_at: form.issued_at || null,
        status: form.status as any,
        notes: form.notes || null,
      });
      if (error) throw error;
      toast.success("Nota fiscal criada");
      setOpen(false);
      setForm({ customer_id: "", sale_id: "", number: "", amount: "", issued_at: "", status: "a_fazer", notes: "" });
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar nota");
    } finally { setSaving(false); }
  };

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase.from("invoices").update({ status: status as any }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Status atualizado");
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const summaryCards = [
    { key: "a_fazer", label: "A fazer", icon: ListTodo },
    { key: "aguardando_emissao", label: "Aguardando emissão", icon: Clock },
    { key: "pronto_para_envio", label: "Pronto para envio", icon: Send },
    { key: "emitida", label: "Emitidas", icon: CheckCircle2 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Notas Fiscais</h1>
          <p className="text-muted-foreground">Controle fiscal por cliente e status</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova nota</Button></DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader><DialogTitle>Nova nota fiscal</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Cliente *</Label>
                <Select value={form.customer_id} onValueChange={onSelectCustomer}>
                  <SelectTrigger><SelectValue placeholder="Selecione…" /></SelectTrigger>
                  <SelectContent>{(customers.data ?? []).map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              {selectedCustomer && (
                <div className="col-span-2 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm space-y-1">
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">CPF/CNPJ</span><span className="font-medium">{selectedCustomer.document || "—"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">E-mail</span><span className="font-medium">{selectedCustomer.email || "—"}</span></div>
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Telefone</span><span className="font-medium">{selectedCustomer.phone || "—"}</span></div>
                </div>
              )}
              {form.customer_id && (customerSales.data ?? []).length > 0 && (
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1">
                    <Label>Venda relacionada</Label>
                    <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={applyAllSales}>
                      Somar todas ({formatCurrency((customerSales.data ?? []).reduce((s: number, x: any) => s + Number(x.total_amount ?? 0), 0))})
                    </Button>
                  </div>
                  <Select value={form.sale_id} onValueChange={applySale}>
                    <SelectTrigger><SelectValue placeholder="Selecione uma venda para puxar o valor…" /></SelectTrigger>
                    <SelectContent>
                      {(customerSales.data ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.sale_date} — {formatCurrency(s.total_amount)} ({s.service_quantity} serv.)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Número</Label><Input value={form.number} onChange={(e) => set("number", e.target.value)} /></div>
              <div><Label>Valor *</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => set("amount", e.target.value)} /></div>
              <div><Label>Data emissão</Label><Input type="date" value={form.issued_at} onChange={(e) => set("issued_at", e.target.value)} /></div>
              <div><Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summaryCards.map((c) => {
          const Icon = c.icon;
          const active = filter === c.key;
          return (
            <button key={c.key} onClick={() => setFilter(active ? "all" : c.key)} className="text-left">
              <Card className={cn("border-border/50 transition-all hover:border-primary/40", active && "border-primary ring-1 ring-primary/40")} style={{ boxShadow: "var(--shadow-card)" }}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{c.label}</p>
                    <p className="text-2xl font-bold tracking-tight">{counts[c.key] ?? 0}</p>
                  </div>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-muted">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                </CardContent>
              </Card>
            </button>
          );
        })}
      </div>

      <div className="flex gap-2 items-center flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por número ou cliente…" className="pl-9" />
        </div>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Número</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Emissão</TableHead>
                <TableHead className="w-[220px]">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((i: any) => {
                const meta = STATUS_META[i.status] ?? STATUS_META.a_fazer;
                const Icon = meta.icon;
                return (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{i.number ?? "—"}</TableCell>
                    <TableCell>
                      <div className="font-medium">{i.customers?.name}</div>
                      {i.customers?.company && <div className="text-xs text-muted-foreground">{i.customers.company}</div>}
                    </TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(i.amount)}</TableCell>
                    <TableCell>{i.issued_at ?? "—"}</TableCell>
                    <TableCell>
                      <Select value={i.status} onValueChange={(v) => updateStatus(i.id, v)}>
                        <SelectTrigger className="h-8 w-[200px]">
                          <span className="flex items-center gap-2">
                            <Icon className={cn("w-3.5 h-3.5", meta.tone)} />
                            <span className="text-xs">{meta.label}</span>
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {STATUS_ORDER.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-12">
                    <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                    {(invoices.data ?? []).length === 0 ? "Sem notas fiscais. Clique em 'Nova nota' para começar." : "Nenhuma nota encontrada com esse filtro."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}