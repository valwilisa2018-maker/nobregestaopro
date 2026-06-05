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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, History, LayoutGrid, List } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Eye } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

function SalesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [editSaving, setEditSaving] = useState(false);

  const sales = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, customers(name,company), sellers(name), producers(name), service_types(name), sale_receipts(*)")
        .order("sale_date", { ascending: false });
      return data ?? [];
    },
  });

  const sellers = useQuery({ queryKey: ["sellers-all"], queryFn: async () => (await supabase.from("sellers").select("id,name").eq("active", true)).data ?? [] });
  const producers = useQuery({ queryKey: ["producers-all"], queryFn: async () => (await supabase.from("producers").select("id,name").eq("active", true)).data ?? [] });
  const serviceTypes = useQuery({ queryKey: ["st-all"], queryFn: async () => (await supabase.from("service_types").select("id,name").eq("active", true).order("sort_order")).data ?? [] });
  const packages = useQuery({ queryKey: ["pkg-all"], queryFn: async () => (await supabase.from("packages").select("id,name,quantity").eq("active", true)).data ?? [] });

  const customersAll = useQuery({
    queryKey: ["customers-all"],
    queryFn: async () => (await supabase.from("customers").select("id,name,company,document,phone,email")).data ?? [],
  });

  const [form, setForm] = useState({
    customer_name: "", company: "", document: "", phone: "", email: "",
    total_amount: "", paid_amount: "0", payment_status: "pendente",
    payment_method: "pix", seller_id: "", producer_id: "", service_type_id: "",
    package_id: "", package_name: "", service_quantity: "1", notes: "", trello_link: "",
    sale_date: new Date().toISOString().slice(0, 10), lead_source: "",
  });

  const set = (k: string, v: string) => {
    setForm((f) => {
      const updatedForm = { ...f, [k]: v };
      
      // Auto-set producer for Pamela/Ester
      const checkInfluencer = () => {
        const selectedServiceType = serviceTypes.data?.find(st => st.id === (k === "service_type_id" ? v : f.service_type_id));
        const selectedSeller = sellers.data?.find(s => s.id === (k === "seller_id" ? v : f.seller_id));
        
        const serviceName = selectedServiceType?.name.toLowerCase() || "";
        const sellerName = selectedSeller?.name.toLowerCase() || "";
        
        if (serviceName.includes("pamela") || serviceName.includes("ester") || 
            sellerName.includes("pamela") || sellerName.includes("ester")) {
          const influencerProducer = producers.data?.find(p => p.name === "GRAVAÇÃO INFLUENCER");
          if (influencerProducer) updatedForm.producer_id = influencerProducer.id;
        }
      };

      if (k === "service_type_id" || k === "seller_id") {
        checkInfluencer();
      }
      
      return updatedForm;
    });
  };

  const autofillFromCustomer = (field: "customer_name" | "company", value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    const list = customersAll.data ?? [];
    const v = value.trim().toLowerCase();
    if (!v) return;
    const match = list.find((c: any) =>
      field === "customer_name"
        ? (c.name ?? "").toLowerCase() === v
        : (c.company ?? "").toLowerCase() === v
    );
    if (match) {
      setForm((f) => ({
        ...f,
        customer_name: match.name ?? f.customer_name,
        company: match.company ?? f.company,
        document: match.document ?? f.document,
        phone: match.phone ?? f.phone,
        email: match.email ?? f.email,
      }));
    }
  };

  const submit = async () => {
    if (saving) return; // Prevent double clicks
    const required: [string, string][] = [
      ["customer_name", "Nome do cliente"], ["company", "Empresa"], ["document", "CPF/CNPJ"],
      ["phone", "Telefone"], ["total_amount", "Valor total"], ["paid_amount", "Valor pago"],
      ["payment_status", "Status pagamento"], ["payment_method", "Forma de pagamento"],
      ["seller_id", "Vendedor"], ["producer_id", "Produtor"], ["service_type_id", "Tipo de serviço"],
      ["service_quantity", "Qtd. serviços"], ["sale_date", "Data da venda"], ["trello_link", "Link Trello"],
      ["lead_source", "Origem da venda"],
    ];
    for (const [k, label] of required) {
      if (!String((form as any)[k] ?? "").trim()) {
        toast.error(`Preencha o campo: ${label}`);
        return;
      }
    }
    if (!receiptFile) { toast.error("Anexe o comprovante"); return; }
    setSaving(true);
    try {
      const list = customersAll.data ?? [];
      const existing = list.find((c: any) =>
        (c.name ?? "").toLowerCase() === form.customer_name.trim().toLowerCase() &&
        (c.company ?? "").toLowerCase() === form.company.trim().toLowerCase()
      );
      let cust: any;
      if (existing) {
        cust = existing;
      } else {
        const { data, error: ce } = await supabase.from("customers").insert({
          name: form.customer_name, company: form.company || null, document: form.document || null,
          phone: form.phone || null, email: form.email || null,
        }).select().single();
        if (ce) throw ce;
        cust = data;
      }

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
        package_name: form.package_name || null,
        service_quantity: Number(form.service_quantity || 1),
        notes: form.notes || null,
        trello_link: form.trello_link || null,
        lead_source: form.lead_source || null,
        receipt_url,
        sale_date: form.sale_date || new Date().toISOString().slice(0, 10),
        created_by: user?.id,
      }).select("id").single().then(async (res) => {
        if (res.error) return { error: res.error };
        // The service_orders and invoices are generated via DB triggers
        if (receipt_url && res.data?.id) {
          await supabase.from("sale_receipts").insert({
            sale_id: res.data.id,
            file_path: receipt_url,
            amount: Number(form.paid_amount || 0),
            paid_at: form.sale_date || new Date().toISOString().slice(0, 10),
            uploaded_by: user?.id ?? null,
            notes: "Comprovante inicial",
          });
        }
        return { error: null };
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

  const editSet = (k: string, v: any) => {
    setEditing((e: any) => {
      if (!e) return e;
      const updatedEditing = { ...e, [k]: v };
      
      // Auto-set producer for Pamela/Ester
      const checkInfluencer = () => {
        const selectedServiceType = serviceTypes.data?.find(st => st.id === (k === "service_type_id" ? v : e.service_type_id));
        const selectedSeller = sellers.data?.find(s => s.id === (k === "seller_id" ? v : e.seller_id));
        
        const serviceName = selectedServiceType?.name.toLowerCase() || "";
        const sellerName = selectedSeller?.name.toLowerCase() || "";
        
        if (serviceName.includes("pamela") || serviceName.includes("ester") || 
            sellerName.includes("pamela") || sellerName.includes("ester")) {
          const influencerProducer = producers.data?.find(p => p.name === "GRAVAÇÃO INFLUENCER");
          if (influencerProducer) updatedEditing.producer_id = influencerProducer.id;
        }
      };

      if (k === "service_type_id" || k === "seller_id") {
        checkInfluencer();
      }
      
      return updatedEditing;
    });
  };

  const submitEdit = async () => {
    if (!editing || editSaving) return;
    setEditSaving(true);
    try {
      if (editing.customer_id) {
        const { error: cuError } = await supabase.from("customers").update({
          name: editing.customer_name || editing.customers?.name,
          company: editing.company || editing.customers?.company,
          document: editing.document || editing.customers?.document,
          phone: editing.phone || editing.customers?.phone,
          email: editing.email || editing.customers?.email,
        }).eq("id", editing.customer_id);
        if (cuError) throw cuError;
      }
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
        package_name: editing.package_name || null,
        service_quantity: Number(editing.service_quantity || 1),
        notes: editing.notes || null,
        trello_link: editing.trello_link || null,
        lead_source: editing.lead_source || null,
      }).eq("id", editing.id);
      if (error) throw error;
      toast.success("Venda atualizada");
      setEditing(null);
      qc.invalidateQueries();
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao atualizar");
    } finally { setEditSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">Cadastre e acompanhe todas as vendas</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-muted rounded-lg p-1 mr-2">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("card")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Venda</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Venda</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do cliente *</Label>
                  <Input list="customers-names" value={form.customer_name} onChange={(e) => autofillFromCustomer("customer_name", e.target.value)} />
                  <datalist id="customers-names">{(customersAll.data ?? []).map((c: any) => (<option key={`n-${c.id}`} value={c.name} />))}</datalist>
                </div>
                <div>
                  <Label>Empresa *</Label>
                  <Input list="customers-companies" value={form.company} onChange={(e) => autofillFromCustomer("company", e.target.value)} />
                  <datalist id="customers-companies">{(customersAll.data ?? []).filter((c: any) => c.company).map((c: any) => (<option key={`c-${c.id}`} value={c.company} />))}</datalist>
                </div>
                <div><Label>CPF/CNPJ *</Label><Input value={form.document} onChange={(e) => set("document", e.target.value)} /></div>
                <div><Label>Telefone *</Label><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
                <div><Label>E-mail (opcional)</Label><Input value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
                <div><Label>Valor total *</Label><Input type="number" step="0.01" value={form.total_amount} onChange={(e) => set("total_amount", e.target.value)} /></div>
                <div><Label>Valor pago *</Label><Input type="number" step="0.01" value={form.paid_amount} onChange={(e) => set("paid_amount", e.target.value)} /></div>
                <div>
                  <Label>Status pagamento *</Label>
                  <Select value={form.payment_status} onValueChange={(v) => set("payment_status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pago_total">Pago total</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pendente">Pendente</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Forma de pagamento *</Label>
                  <Select value={form.payment_method} onValueChange={(v) => set("payment_method", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="cartao">Cartão</SelectItem><SelectItem value="boleto">Boleto</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Vendedor *</Label>
                  <Select value={form.seller_id} onValueChange={(v) => set("seller_id", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Produtor *</Label>
                  <Select 
                    value={form.producer_id} 
                    onValueChange={(v) => set("producer_id", v)}
                    disabled={
                      (serviceTypes.data?.find(st => st.id === form.service_type_id)?.name.toLowerCase().includes("pamela") ||
                       serviceTypes.data?.find(st => st.id === form.service_type_id)?.name.toLowerCase().includes("ester") ||
                       sellers.data?.find(s => s.id === form.seller_id)?.name.toLowerCase().includes("pamela") ||
                       sellers.data?.find(s => s.id === form.seller_id)?.name.toLowerCase().includes("ester")) ?? false
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de serviço *</Label>
                  <Select value={form.service_type_id} onValueChange={(v) => set("service_type_id", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pacote (opcional)</Label>
                  <Select value={form.package_id} onValueChange={(v) => {
                    const p = (packages.data ?? []).find((x: any) => x.id === v);
                    setForm((f) => ({ ...f, package_id: v, package_name: p?.name ?? f.package_name }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {(packages.data ?? []).length === 0 ? (<div className="px-3 py-4 text-xs text-muted-foreground">Nenhum pacote cadastrado.</div>) : (packages.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Qtd. serviços *</Label><Input type="number" min="1" value={form.service_quantity} onChange={(e) => set("service_quantity", e.target.value)} /></div>
                <div><Label>Data da venda *</Label><Input type="date" value={form.sale_date} onChange={(e) => set("sale_date", e.target.value)} /></div>
                <div className="col-span-2">
                  <Label>Origem da venda *</Label>
                  <Select value={form.lead_source} onValueChange={(v) => set("lead_source", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cliente_recuperacao">Cliente Recuperação</SelectItem><SelectItem value="trafego_pago">Tráfego Pago</SelectItem><SelectItem value="indicacao">Indicação</SelectItem><SelectItem value="organico">Orgânico / Redes Sociais</SelectItem><SelectItem value="cliente_antigo">Cliente Antigo</SelectItem><SelectItem value="prospeccao">Prospecção Ativa</SelectItem><SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Link Trello / card externo *</Label>
                  <div className="flex gap-2">
                    <Input value={form.trello_link} onChange={(e) => set("trello_link", e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Google Drive</Button>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Comprovante (imagem ou PDF) *</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                  {receiptFile && <p className="text-xs text-muted-foreground mt-1">{receiptFile.name}</p>}
                </div>
                <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} /></div>
              </div>
              <DialogFooter><Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar venda</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {viewMode === "table" ? (
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Serviço</TableHead><TableHead>Vendedor</TableHead><TableHead>Produtor</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
              <TableBody>
                {(sales.data ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                    <TableCell><div className="font-medium">{s.customers?.name}</div><div className="text-xs text-muted-foreground">{s.customers?.company}</div></TableCell>
                    <TableCell>{s.service_types?.name ?? "—"}</TableCell><TableCell>{s.sellers?.name ?? "—"}</TableCell><TableCell>{s.producers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(s.total_amount)}</TableCell>
                    <TableCell><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" onClick={() => setEditing({ ...s })}><Pencil className="w-4 h-4" /></Button>
                        <Dialog>
                          <DialogTrigger asChild><Button size="icon" variant="ghost"><Eye className="w-4 h-4" /></Button></DialogTrigger>
                          <DialogContent className="max-w-xl">
                            <DialogHeader><DialogTitle>Histórico de Pagamentos e Comprovantes</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                              <Tabs defaultValue="receipts" className="w-full">
                                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                                <TabsContent value="receipts" className="mt-4">
                                  {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                    <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                  ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                                </TabsContent>
                                <TabsContent value="history" className="mt-4">
                                  <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
                                </TabsContent>
                              </Tabs>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(sales.data ?? []).length === 0 && (<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma venda cadastrada ainda</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(sales.data ?? []).map((s: any) => (
            <Card key={s.id} className="border-border/50 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start"><div><h3 className="font-bold text-lg leading-tight">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div>
                  <div className="grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">Serviço</p><p className="font-medium truncate">{s.service_types?.name ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{fmtDate(s.sale_date)}</p></div><div><p className="text-xs text-muted-foreground">Vendedor</p><p className="font-medium truncate">{s.sellers?.name ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Produtor</p><p className="font-medium truncate">{s.producers?.name ?? "—"}</p></div></div>
                  <div className="pt-2 border-t flex justify-between items-center"><div><p className="text-xs text-muted-foreground">Valor Total</p><p className="text-lg font-bold text-primary">{formatCurrency(s.total_amount)}</p></div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditing({ ...s })}><Pencil className="w-4 h-4" /></Button>
                      <Dialog>
                        <DialogTrigger asChild><Button size="icon" variant="outline" className="h-8 w-8"><Eye className="w-4 h-4" /></Button></DialogTrigger>
                        <DialogContent className="max-w-xl">
                          <DialogHeader><DialogTitle>Histórico de Pagamentos e Comprovantes</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                            <Tabs defaultValue="receipts" className="w-full">
                              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                              <TabsContent value="receipts" className="mt-4">
                                {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                  <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                              </TabsContent>
                              <TabsContent value="history" className="mt-4">
                                <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(sales.data ?? []).length === 0 && (<div className="col-span-full py-12 text-center text-muted-foreground italic">Nenhuma venda cadastrada ainda</div>)}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar venda</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome do cliente *</Label>
                <Input list="edit-customers-names" value={editing.customer_name ?? editing.customers?.name ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, customer_name: e.target.value }))} />
                <datalist id="edit-customers-names">{(customersAll.data ?? []).map((c: any) => (<option key={`en-${c.id}`} value={c.name} />))}</datalist>
              </div>
              <div>
                <Label>Empresa *</Label>
                <Input list="edit-customers-companies" value={editing.company ?? editing.customers?.company ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, company: e.target.value }))} />
                <datalist id="edit-customers-companies">{(customersAll.data ?? []).filter((c: any) => c.company).map((c: any) => (<option key={`ec-${c.id}`} value={c.company} />))}</datalist>
              </div>
              <div><Label>CPF/CNPJ *</Label><Input value={editing.document ?? editing.customers?.document ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, document: e.target.value }))} /></div>
              <div><Label>Telefone *</Label><Input value={editing.phone ?? editing.customers?.phone ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, phone: e.target.value }))} /></div>
              <div><Label>E-mail (opcional)</Label><Input value={editing.email ?? editing.customers?.email ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, email: e.target.value }))} /></div>
              <div><Label>Valor total *</Label><Input type="number" step="0.01" value={editing.total_amount ?? ""} onChange={(e) => editSet("total_amount", e.target.value)} /></div>
              <div><Label>Valor pago *</Label><Input type="number" step="0.01" value={editing.paid_amount ?? ""} onChange={(e) => editSet("paid_amount", e.target.value)} /></div>
              <div>
                <Label>Status pagamento *</Label>
                <Select value={editing.payment_status} onValueChange={(v) => editSet("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pago_total">Pago total</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pendente">Pendente</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma de pagamento *</Label>
                <Select value={editing.payment_method ?? ""} onValueChange={(v) => editSet("payment_method", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="cartao">Cartão</SelectItem><SelectItem value="boleto">Boleto</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Vendedor *</Label>
                <Select value={editing.seller_id ?? ""} onValueChange={(v) => editSet("seller_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produtor *</Label>
                <Select 
                  value={editing.producer_id ?? ""} 
                  onValueChange={(v) => editSet("producer_id", v)}
                  disabled={
                    (serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name.toLowerCase().includes("pamela") ||
                     serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name.toLowerCase().includes("ester") ||
                     sellers.data?.find(s => s.id === editing.seller_id)?.name.toLowerCase().includes("pamela") ||
                     sellers.data?.find(s => s.id === editing.seller_id)?.name.toLowerCase().includes("ester")) ?? false
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de serviço *</Label>
                <Select value={editing.service_type_id ?? ""} onValueChange={(v) => editSet("service_type_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pacote (opcional)</Label>
                <Select value={editing.package_id ?? ""} onValueChange={(v) => {
                  const p = (packages.data ?? []).find((x: any) => x.id === v);
                  setEditing((prev: any) => ({ ...prev, package_id: v, package_name: p?.name ?? prev.package_name }));
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(packages.data ?? []).length === 0 ? (<div className="px-3 py-4 text-xs text-muted-foreground">Nenhum pacote cadastrado.</div>) : (packages.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
                </Select>
              </div>
              <div><Label>Qtd. serviços *</Label><Input type="number" min="1" value={editing.service_quantity ?? 1} onChange={(e) => editSet("service_quantity", e.target.value)} /></div>
              <div><Label>Data da venda *</Label><Input type="date" value={editing.sale_date ?? ""} onChange={(e) => editSet("sale_date", e.target.value)} /></div>
              <div className="col-span-2">
                <Label>Origem da venda *</Label>
                <Select value={editing.lead_source ?? ""} onValueChange={(v) => editSet("lead_source", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent><SelectItem value="cliente_recuperacao">Cliente Recuperação</SelectItem><SelectItem value="trafego_pago">Tráfego Pago</SelectItem><SelectItem value="indicacao">Indicação</SelectItem><SelectItem value="organico">Orgânico / Redes Sociais</SelectItem><SelectItem value="cliente_antigo">Cliente Antigo</SelectItem><SelectItem value="prospeccao">Prospecção Ativa</SelectItem><SelectItem value="outros">Outros</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>Link Trello / card externo *</Label>
                <div className="flex gap-2">
                  <Input value={editing.trello_link ?? ""} onChange={(e) => editSet("trello_link", e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Google Drive</Button>
                </div>
              </div>
              <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={editing.notes ?? ""} onChange={(e) => editSet("notes", e.target.value)} /></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button><Button onClick={submitEdit} disabled={editSaving}>{editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
