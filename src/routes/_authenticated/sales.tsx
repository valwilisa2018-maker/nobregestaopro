import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

function SalesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  const sales = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, customers(name,company), sellers(name), producers(name), service_types(name)")
        .order("sale_date", { ascending: false });
      return data ?? [];
    },
  });

  const sellers = useQuery({ queryKey: ["sellers-all"], queryFn: async () => (await supabase.from("sellers").select("id,name").eq("active", true)).data ?? [] });
  const producers = useQuery({ queryKey: ["producers-all"], queryFn: async () => (await supabase.from("producers").select("id,name").eq("active", true)).data ?? [] });
  const serviceTypes = useQuery({ queryKey: ["st-all"], queryFn: async () => (await supabase.from("service_types").select("id,name").eq("active", true).order("sort_order")).data ?? [] });
  const packages = useQuery({ queryKey: ["pkg-all"], queryFn: async () => (await supabase.from("packages").select("id,name,quantity").eq("active", true)).data ?? [] });

  const [form, setForm] = useState({
    customer_name: "", company: "", document: "", phone: "", email: "",
    total_amount: "", paid_amount: "0", payment_status: "pendente",
    payment_method: "pix", seller_id: "", producer_id: "", service_type_id: "",
    package_id: "", service_quantity: "1", notes: "", trello_link: "",
    sale_date: new Date().toISOString().slice(0, 10),
  });
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.customer_name || !form.total_amount) { toast.error("Cliente e valor são obrigatórios"); return; }
    setSaving(true);
    try {
      const { data: cust, error: ce } = await supabase.from("customers").insert({
        name: form.customer_name, company: form.company || null, document: form.document || null,
        phone: form.phone || null, email: form.email || null,
      }).select().single();
      if (ce) throw ce;

      const { data: { user } } = await supabase.auth.getUser();

      let receipt_url: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() || "bin";
        const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: ue } = await supabase.storage.from("receipts").upload(path, receiptFile, {
          contentType: receiptFile.type || undefined,
          upsert: false,
        });
        if (ue) throw ue;
        receipt_url = path;
      }

      const { error: se } = await supabase.from("sales").insert({
        customer_id: cust.id,
        total_amount: Number(form.total_amount),
        paid_amount: Number(form.paid_amount || 0),
        payment_status: form.payment_status as any,
        payment_method: form.payment_method as any,
        seller_id: form.seller_id || null,
        producer_id: form.producer_id || null,
        service_type_id: form.service_type_id || null,
        package_id: form.package_id || null,
        service_quantity: Number(form.service_quantity || 1),
        notes: form.notes || null,
        trello_link: form.trello_link || null,
        receipt_url,
        sale_date: form.sale_date || null,
        created_by: user?.id,
      });
      if (se) throw se;
      toast.success("Venda criada — cards de produção gerados automaticamente");
      setOpen(false);
      setReceiptFile(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao criar venda");
    } finally { setSaving(false); }
  };

  const statusVariant = (s: string) =>
    s === "pago_total" ? "default" : s === "pago_parcial" ? "secondary" : "destructive";

  const editSet = (k: string, v: any) => setEditing((e: any) => ({ ...e, [k]: v }));

  const submitEdit = async () => {
    if (!editing) return;
    setEditSaving(true);
    try {
      const { error } = await supabase.from("sales").update({
        sale_date: editing.sale_date,
        total_amount: Number(editing.total_amount),
        paid_amount: Number(editing.paid_amount || 0),
        payment_status: editing.payment_status,
        payment_method: editing.payment_method,
        seller_id: editing.seller_id || null,
        producer_id: editing.producer_id || null,
        service_type_id: editing.service_type_id || null,
        package_id: editing.package_id || null,
        service_quantity: Number(editing.service_quantity || 1),
        notes: editing.notes || null,
        trello_link: editing.trello_link || null,
      }).eq("id", editing.id);
      if (error) throw error;
      toast.success("Venda atualizada");
      setEditing(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar");
    } finally { setEditSaving(false); }
  };

  const fmtDate = (d?: string | null) => {
    if (!d) return "—";
    const [y, m, day] = d.split("-");
    return `${day}/${m}/${y}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">Cadastre e acompanhe todas as vendas</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Venda</Button></DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Nova Venda</DialogTitle></DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Label>Nome do cliente *</Label><Input value={form.customer_name} onChange={(e) => set("customer_name", e.target.value)} /></div>
              <div><Label>Empresa</Label><Input value={form.company} onChange={(e) => set("company", e.target.value)} /></div>
              <div><Label>CPF/CNPJ</Label><Input value={form.document} onChange={(e) => set("document", e.target.value)} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
              <div><Label>Valor total *</Label><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => set("total_amount", e.target.value)} /></div>
              <div><Label>Valor pago</Label><Input type="number" step="0.01" value={form.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} /></div>
              <div><Label>Status pagamento</Label>
                <Select value={form.payment_status} onValueChange={(v) => set("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago_total">Pago total</SelectItem>
                    <SelectItem value="pago_parcial">Pago parcial</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Forma de pagamento</Label>
                <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Vendedor</Label>
                <Select value={form.seller_id} onValueChange={(v) => set("seller_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Produtor</Label>
                <Select value={form.producer_id} onValueChange={(v) => set("producer_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo de serviço</Label>
                <Select value={form.service_type_id} onValueChange={(v) => set("service_type_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pacote</Label>
                <Select value={form.package_id} onValueChange={(v) => set("package_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(packages.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.quantity})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Qtd. serviços no pacote</Label><Input type="number" min="1" value={form.service_quantity} onChange={(e) => set("service_quantity", e.target.value)} /></div>
              <div><Label>Data da venda</Label><Input type="date" value={form.sale_date} onChange={(e) => set("sale_date", e.target.value)} /></div>
              <div className="col-span-2"><Label>Link Trello / card externo</Label><Input value={form.trello_link} onChange={(e) => set("trello_link", e.target.value)} /></div>
              <div className="col-span-2">
                <Label>Comprovante (imagem ou PDF)</Label>
                <Input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)}
                />
                {receiptFile && (
                  <p className="text-xs text-muted-foreground mt-1">{receiptFile.name}</p>
                )}
              </div>
              <div className="col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
            </div>
            <DialogFooter>
              <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar venda</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Vendedor</TableHead>
                <TableHead>Produtor</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-12"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sales.data ?? []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{s.customers?.name}</div>
                    <div className="text-xs text-muted-foreground">{s.customers?.company}</div>
                  </TableCell>
                  <TableCell>{s.service_types?.name ?? "—"}</TableCell>
                  <TableCell>{s.sellers?.name ?? "—"}</TableCell>
                  <TableCell>{s.producers?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-semibold">{formatCurrency(s.total_amount)}</TableCell>
                  <TableCell><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <Button size="icon" variant="ghost" onClick={() => setEditing({ ...s })}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {(sales.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma venda cadastrada ainda</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar venda</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Data da venda</Label><Input type="date" value={editing.sale_date ?? ""} onChange={(e) => editSet("sale_date", e.target.value)} /></div>
              <div><Label>Valor total</Label><Input type="number" step="0.01" value={editing.total_amount ?? ""} onChange={(e) => editSet("total_amount", e.target.value)} /></div>
              <div><Label>Valor pago</Label><Input type="number" step="0.01" value={editing.paid_amount ?? ""} onChange={(e) => editSet("paid_amount", e.target.value)} /></div>
              <div><Label>Status pagamento</Label>
                <Select value={editing.payment_status} onValueChange={(v) => editSet("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago_total">Pago total</SelectItem>
                    <SelectItem value="pago_parcial">Pago parcial</SelectItem>
                    <SelectItem value="pendente">Pendente</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Forma de pagamento</Label>
                <Select value={editing.payment_method ?? ""} onValueChange={(v) => editSet("payment_method", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao">Cartão</SelectItem>
                    <SelectItem value="boleto">Boleto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Vendedor</Label>
                <Select value={editing.seller_id ?? ""} onValueChange={(v) => editSet("seller_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Produtor</Label>
                <Select value={editing.producer_id ?? ""} onValueChange={(v) => editSet("producer_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Tipo de serviço</Label>
                <Select value={editing.service_type_id ?? ""} onValueChange={(v) => editSet("service_type_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Pacote</Label>
                <Select value={editing.package_id ?? ""} onValueChange={(v) => editSet("package_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(packages.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.quantity})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Qtd. serviços</Label><Input type="number" min="1" value={editing.service_quantity ?? 1} onChange={(e) => editSet("service_quantity", e.target.value)} /></div>
              <div className="col-span-2"><Label>Link Trello</Label><Input value={editing.trello_link ?? ""} onChange={(e) => editSet("trello_link", e.target.value)} /></div>
              <div className="col-span-2"><Label>Observações</Label><Textarea value={editing.notes ?? ""} onChange={(e) => editSet("notes", e.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}