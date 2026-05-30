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
import { Switch } from "@/components/ui/switch";
import { Plus, Loader2, FileText, Clock, Send, ListTodo, CheckCircle2, XCircle, Search, Paperclip, Download, ExternalLink, MessageCircle } from "lucide-react";
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
  const [grouped, setGrouped] = useState(true);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [dialogFile, setDialogFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    customer_id: "", sale_id: "", number: "", amount: "", issued_at: "",
    status: "a_fazer", notes: "",
  });
  // Sempre que abrir o dialog, puxa a data de hoje (mas pode editar)
  const openDialog = (v: boolean) => {
    if (v) {
      const today = new Date().toISOString().slice(0, 10);
      setForm((f) => ({ ...f, issued_at: f.issued_at || today }));
    }
    setOpen(v);
  };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const invoices = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => (await supabase.from("invoices").select("*, customers(name,company,phone)").order("created_at", { ascending: false })).data ?? [],
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

  // Agrupa por cliente + status — útil quando há várias notas a fazer do mesmo cliente
  const groupedRows = useMemo(() => {
    const map = new Map<string, any>();
    filtered.forEach((i: any) => {
      const key = `${i.customer_id}__${i.status}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          ids: [i.id],
          customer_id: i.customer_id,
          customers: i.customers,
          status: i.status,
          amount: Number(i.amount ?? 0),
          count: 1,
          number: i.number,
          issued_at: i.issued_at,
          file_url: i.file_url,
        });
      } else {
        existing.ids.push(i.id);
        existing.amount += Number(i.amount ?? 0);
        existing.count += 1;
        if (!existing.number && i.number) existing.number = i.number;
        if (!existing.file_url && i.file_url) existing.file_url = i.file_url;
      }
    });
    return Array.from(map.values());
  }, [filtered]);

  const submit = async () => {
    if (!form.customer_id || !form.amount) { toast.error("Cliente e valor são obrigatórios"); return; }
    setSaving(true);
    try {
      const { data: inserted, error } = await supabase.from("invoices").insert({
        customer_id: form.customer_id,
        sale_id: form.sale_id || null,
        number: form.number || null,
        amount: Number(form.amount),
        issued_at: form.issued_at || null,
        status: form.status as any,
        notes: form.notes || null,
      }).select("id").single();
      if (error) throw error;
      if (dialogFile && inserted?.id) {
        const ext = dialogFile.name.split(".").pop();
        const path = `${inserted.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("invoices").upload(path, dialogFile, { upsert: true });
        if (!upErr) {
          const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
          await supabase.from("invoices").update({ file_url: pub.publicUrl }).eq("id", inserted.id);
        }
      }
      toast.success("Nota fiscal criada");
      setOpen(false);
      setForm({ customer_id: "", sale_id: "", number: "", amount: "", issued_at: "", status: "a_fazer", notes: "" });
      setDialogFile(null);
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

  const updateStatusBulk = async (ids: string[], status: string) => {
    const { error } = await supabase.from("invoices").update({ status: status as any }).in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} nota(s) atualizada(s)`);
    qc.invalidateQueries({ queryKey: ["invoices"] });
  };

  const uploadFile = async (id: string, file: File) => {
    setUploadingId(id);
    try {
      const ext = file.name.split(".").pop();
      const path = `${id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
      const { error } = await supabase.from("invoices").update({ file_url: pub.publicUrl }).eq("id", id);
      if (error) throw error;
      toast.success("Nota anexada");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao anexar arquivo");
    } finally { setUploadingId(null); }
  };

  const uploadFileBulk = async (ids: string[], file: File) => {
    const groupKey = ids.join("-").slice(0, 40);
    setUploadingId(groupKey);
    try {
      const ext = file.name.split(".").pop();
      const path = `grouped/${ids[0]}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("invoices").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("invoices").getPublicUrl(path);
      const { error } = await supabase.from("invoices").update({ file_url: pub.publicUrl }).in("id", ids);
      if (error) throw error;
      toast.success(`Nota anexada a ${ids.length} item(s)`);
      qc.invalidateQueries({ queryKey: ["invoices"] });
    } catch (e: any) {
      toast.error(e.message ?? "Erro ao anexar arquivo");
    } finally { setUploadingId(null); }
  };

  const sendWhatsAppGroup = async (g: any) => {
    const phone = (g.customers?.phone ?? "").replace(/\D/g, "");
    if (!phone) { toast.error("Cliente sem telefone cadastrado"); return; }
    const name = g.customers?.name ?? "cliente";
    const valorTxt = formatCurrency(g.amount);
    const linkTxt = g.file_url ? `\n\nAcesse aqui: ${g.file_url}` : "";
    const qtdTxt = g.count > 1 ? ` (${g.count} itens agrupados)` : "";
    const msg = `Olá ${name}, segue sua nota fiscal${qtdTxt} no valor total de ${valorTxt}.${linkTxt}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    const { error } = await supabase.from("invoices").update({ status: "emitida" as any }).in("id", g.ids);
    if (!error) {
      toast.success("WhatsApp aberto — notas marcadas como Emitidas");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
  };

  const exportCsv = () => {
    const rows = filtered;
    if (!rows.length) { toast.error("Nada para exportar"); return; }
    const head = ["Numero", "Cliente", "Empresa", "Valor", "Emissao", "Status", "Arquivo"];
    const body = rows.map((i: any) => [
      i.number ?? "",
      i.customers?.name ?? "",
      i.customers?.company ?? "",
      i.amount,
      i.issued_at ?? "",
      STATUS_META[i.status]?.label ?? i.status,
      i.file_url ?? "",
    ]);
    const csv = [head, ...body].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notas-fiscais-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sendWhatsApp = async (inv: any) => {
    const phone = (inv.customers?.phone ?? "").replace(/\D/g, "");
    if (!phone) { toast.error("Cliente sem telefone cadastrado"); return; }
    const name = inv.customers?.name ?? "cliente";
    const numberTxt = inv.number ? `nº ${inv.number}` : "";
    const valorTxt = formatCurrency(inv.amount);
    const linkTxt = inv.file_url ? `\n\nAcesse aqui: ${inv.file_url}` : "";
    const msg = `Olá ${name}, segue sua nota fiscal ${numberTxt} no valor de ${valorTxt}.${linkTxt}`;
    const url = `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener,noreferrer");
    // marca como emitida automaticamente
    const { error } = await supabase.from("invoices").update({ status: "emitida" as any }).eq("id", inv.id);
    if (!error) {
      toast.success("WhatsApp aberto — nota marcada como Emitida");
      qc.invalidateQueries({ queryKey: ["invoices"] });
    }
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
        <div className="flex gap-2">
        <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />Exportar</Button>
        <Dialog open={open} onOpenChange={openDialog}>
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
              <div className="col-span-2">
                <Label>Anexar nota fiscal (PDF, XML, imagem)</Label>
                <Input type="file" accept=".pdf,.xml,image/*" onChange={(e) => setDialogFile(e.target.files?.[0] ?? null)} />
                {dialogFile && <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><Paperclip className="w-3 h-3" />{dialogFile.name}</p>}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={submit} disabled={saving}>{saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
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
                <TableHead className="w-[140px]">Arquivo</TableHead>
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
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <label className="inline-flex">
                          <input type="file" className="hidden" accept=".pdf,.xml,.png,.jpg,.jpeg" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(i.id, f); e.currentTarget.value = ""; }} />
                          <Button asChild size="sm" variant="ghost" disabled={uploadingId === i.id}>
                            <span className="cursor-pointer">
                              {uploadingId === i.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Paperclip className="w-4 h-4" />}
                            </span>
                          </Button>
                        </label>
                        {i.file_url && (
                          <Button size="sm" variant="ghost" asChild>
                            <a href={i.file_url} target="_blank" rel="noreferrer"><ExternalLink className="w-4 h-4" /></a>
                          </Button>
                        )}
                        {i.status === "pronto_para_envio" && (
                          <Button size="sm" variant="default" onClick={() => sendWhatsApp(i)} className="h-8 gap-1">
                            <MessageCircle className="w-4 h-4" />Enviar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-12">
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