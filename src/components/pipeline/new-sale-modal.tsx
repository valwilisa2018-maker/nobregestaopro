import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ShoppingCart, Loader2, User, Phone, Building2, IdCard, CreditCard, Layers, FileText, UserSquare2, Wallet, StickyNote, Save } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "./types";
import type { Stage } from "./types";

type Product = { id: string; name: string; price_cents: number; active: boolean };
type Contact = { id: string; name: string | null; phone: string | null };
type Item = { key: string; product_id: string | null; product_name: string; unit_price_cents: number; quantity: number };

const PAYMENTS = ["Pix", "Cartão de Crédito", "Cartão de Débito", "Dinheiro", "Boleto", "Transferência"];

export function NewSaleModal({
  open, onClose, stages, onSaved,
}: { open: boolean; onClose: () => void; stages: Stage[]; onSaved: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState<string>("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [document, setDocument] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [sellerName, setSellerName] = useState("");
  const [payment, setPayment] = useState<string>("Pix");
  const [paymentStatus, setPaymentStatus] = useState<"paid" | "partial" | "pending">("paid");
  const [downPayment, setDownPayment] = useState<string>("");
  const [note, setNote] = useState("");
  const [stageId, setStageId] = useState<string>("");
  const [items, setItems] = useState<Item[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const [pr, ct] = await Promise.all([
        supabase.from("sale_products" as never).select("id,name,price_cents,active").eq("user_id", uid).eq("active", true).order("name"),
        supabase.from("contacts").select("id,name,phone").eq("user_id", uid).order("name").limit(500),
      ]);
      setProducts(((pr.data as unknown) as Product[]) || []);
      setContacts(((ct.data as unknown) as Contact[]) || []);
      const won = stages.find((s) => s.is_won);
      const first = [...stages].sort((a, b) => a.position - b.position)[0];
      setStageId(won?.id || first?.id || "");
    })();
  }, [open, stages]);

  const total = useMemo(() => items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0), [items]);

  const addItem = () => {
    setItems((prev) => [...prev, { key: crypto.randomUUID(), product_id: null, product_name: "", unit_price_cents: 0, quantity: 1 }]);
  };

  const patchItem = (key: string, patch: Partial<Item>) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, ...patch } : i)));
  };

  const pickProduct = (key: string, productId: string) => {
    const p = products.find((x) => x.id === productId);
    if (!p) return;
    patchItem(key, { product_id: p.id, product_name: p.name, unit_price_cents: p.price_cents });
  };

  const removeItem = (key: string) => setItems((prev) => prev.filter((i) => i.key !== key));

  const pickContact = (id: string) => {
    setContactId(id);
    const c = contacts.find((x) => x.id === id);
    if (c) { setName(c.name || ""); setPhone(c.phone || ""); }
  };

  const reset = () => {
    setContactId(""); setName(""); setPhone(""); setPayment("Pix");
    setNote(""); setItems([]); setStageId("");
    setCompany(""); setDocument(""); setInvoiceNumber("");
    setSellerName("");
    setPaymentStatus("paid"); setDownPayment("");
  };

  const save = async () => {
    if (!name.trim()) { toast.error("Informe o nome do cliente"); return; }
    if (items.length === 0) { toast.error("Adicione ao menos um produto"); return; }
    if (items.some((i) => !i.product_name.trim())) { toast.error("Selecione o produto de todos os itens"); return; }
    if (!stageId) { toast.error("Escolha a etapa do pipeline"); return; }

    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) { toast.error("Sessão expirada"); return; }

      // 1. cria card no pipeline
      const { data: deal, error: dealErr } = await supabase.from("pipeline_deals" as never).insert({
        user_id: uid,
        stage_id: stageId,
        title: name.trim(),
        phone: phone || null,
        whatsapp: phone || null,
        value_cents: total,
        product: items.map((i) => `${i.quantity}x ${i.product_name}`).join(", "),
        source: "venda",
        priority: "high",
        notes: note || null,
        tags: ["venda"],
        links: {},
        checklist: [],
      } as never).select("id").single();
      if (dealErr) throw dealErr;
      const dealId = (deal as { id: string }).id;

      // 2. cria sale
      const { data: sale, error: saleErr } = await supabase.from("sales" as never).insert({
        user_id: uid,
        contact_id: contactId || null,
        contact_name: name.trim(),
        phone: phone || null,
        company: company.trim() || null,
        document: document.trim() || null,
        invoice_number: invoiceNumber.trim() || null,
        seller_name: sellerName.trim() || null,
        payment_method: payment,
        payment_status: paymentStatus,
        down_payment_cents: paymentStatus === "partial" ? Math.round((parseFloat(downPayment) || 0) * 100) : (paymentStatus === "paid" ? total : 0),
        note: note || null,
        total_cents: total,
        stage_id: stageId,
        deal_id: dealId,
        status: "open",
      } as never).select("id").single();
      if (saleErr) throw saleErr;
      const saleId = (sale as { id: string }).id;

      // 3. itens
      const rows = items.map((i) => ({
        sale_id: saleId,
        user_id: uid,
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        unit_price_cents: i.unit_price_cents,
        subtotal_cents: i.unit_price_cents * i.quantity,
      }));
      const { error: itemsErr } = await supabase.from("sale_items" as never).insert(rows as never);
      if (itemsErr) throw itemsErr;

      toast.success("Venda criada com sucesso");
      reset();
      onSaved();
      onClose();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar venda");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto border-slate-800/70 bg-gradient-to-b from-slate-950 to-slate-900 text-slate-100 shadow-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500/30 to-indigo-600/30 ring-1 ring-blue-500/40">
              <ShoppingCart className="h-5 w-5 text-blue-400" />
            </span>
            Nova Venda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-2">
            <Label className="text-slate-200 font-semibold flex items-center gap-2"><User className="h-3.5 w-3.5 text-blue-400" />Vincular a contato existente (opcional)</Label>
            <Select value={contactId || "none"} onValueChange={(v) => v === "none" ? setContactId("") : pickContact(v)}>
              <SelectTrigger className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500/60"><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Digitar manualmente —</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name || c.phone}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><User className="h-3.5 w-3.5 text-blue-400" />Nome do cliente <span className="text-blue-400">*</span></Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><Phone className="h-3.5 w-3.5 text-blue-400" />Telefone / WhatsApp</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55XXXXXXXXXXX"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><Building2 className="h-3.5 w-3.5 text-blue-400" />Empresa</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Razão social / Nome fantasia"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><IdCard className="h-3.5 w-3.5 text-blue-400" />CPF / CNPJ</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><CreditCard className="h-3.5 w-3.5 text-blue-400" />Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500/60"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><Layers className="h-3.5 w-3.5 text-blue-400" />Etapa inicial <span className="text-blue-400">*</span></Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500/60"><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><FileText className="h-3.5 w-3.5 text-blue-400" />Nº da Nota Fiscal</Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: 000123"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
            <div className="grid gap-2">
              <Label className="text-slate-200 font-semibold flex items-center gap-2"><UserSquare2 className="h-3.5 w-3.5 text-blue-400" />Vendedor</Label>
              <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Nome do vendedor"
                className="h-11 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
            </div>
          </div>

          <div className="grid gap-2">
            <Label className="text-slate-200 font-semibold flex items-center gap-2"><Wallet className="h-3.5 w-3.5 text-blue-400" />Status do pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "paid", label: "Pago" },
                { v: "partial", label: "Parcial" },
                { v: "pending", label: "Pendente" },
              ] as const).map((o) => (
                <Button key={o.v} type="button" size="sm"
                  onClick={() => setPaymentStatus(o.v)}
                  className={paymentStatus === o.v
                    ? "bg-gradient-to-br from-blue-600 to-indigo-600 text-white ring-1 ring-blue-500/60 shadow-[0_0_20px_-4px_rgba(59,130,246,0.6)] hover:from-blue-500 hover:to-indigo-500"
                    : "bg-slate-900/60 border border-slate-800 text-slate-300 hover:bg-slate-800/60 hover:text-slate-100"}>
                  {o.label}
                </Button>
              ))}
            </div>
            {paymentStatus === "partial" && (
              <div className="grid gap-1 mt-2 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                <Label className="text-xs text-slate-300">Valor da entrada (R$)</Label>
                <Input type="number" min={0} step="0.01" value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)} placeholder="0,00"
                  className="h-10 bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60" />
                <p className="text-[11px] text-slate-400">
                  Restante: <strong className="tabular-nums text-blue-300">{formatBRL(Math.max(0, total - Math.round((parseFloat(downPayment) || 0) * 100)))}</strong>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/40 p-4">
            <div className="flex items-center justify-between">
              <Label className="text-slate-200 font-semibold">Produtos <span className="text-blue-400">*</span></Label>
              <Button size="sm" onClick={addItem} type="button"
                className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-[0_0_20px_-4px_rgba(59,130,246,0.6)]">
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-slate-400 py-6 text-center border border-dashed border-slate-800 rounded-lg">
                Nenhum produto. Clique em Adicionar.
              </p>
            )}
            {items.map((i) => (
              <div key={i.key} className="grid grid-cols-[1fr_80px_110px_36px] gap-2 items-end">
                <Select value={i.product_id ?? ""} onValueChange={(v) => pickProduct(i.key, v)}>
                  <SelectTrigger className="h-10 bg-slate-900/60 border-slate-800 text-slate-100 focus:ring-2 focus:ring-blue-500/60"><SelectValue placeholder="Produto" /></SelectTrigger>
                  <SelectContent>
                    {products.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum produto configurado. Vá à aba "Produtos".</div>}
                    {products.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {formatBRL(p.price_cents)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  type="number" min={1}
                  value={i.quantity}
                  onChange={(e) => patchItem(i.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="h-10 bg-slate-900/60 border-slate-800 text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                />
                <Input
                  type="number" min={0} step="0.01"
                  value={(i.unit_price_cents / 100).toFixed(2)}
                  onChange={(e) => patchItem(i.key, { unit_price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                  className="h-10 bg-slate-900/60 border-slate-800 text-slate-100 focus-visible:ring-2 focus-visible:ring-blue-500/60"
                />
                <Button variant="ghost" size="icon" onClick={() => removeItem(i.key)} type="button" className="hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4 text-red-400" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label className="text-slate-200 font-semibold flex items-center gap-2"><StickyNote className="h-3.5 w-3.5 text-blue-400" />Observação</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhes da venda…" rows={3}
              className="bg-slate-900/60 border-slate-800 text-slate-100 placeholder:text-slate-500 focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60" />
          </div>

          <div className="flex items-center justify-between rounded-xl border border-blue-500/40 bg-gradient-to-br from-blue-600/20 to-indigo-600/10 p-4 shadow-[0_0_30px_-8px_rgba(59,130,246,0.5)]">
            <span className="text-sm font-semibold text-slate-200">Total da venda</span>
            <span className="text-2xl font-black tabular-nums text-blue-300">{formatBRL(total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 border-t border-slate-800 pt-4">
          <Button variant="ghost" onClick={onClose} disabled={saving}
            className="text-slate-300 hover:bg-slate-800/60 hover:text-slate-100">
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving}
            className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white hover:from-blue-500 hover:to-indigo-500 shadow-[0_0_24px_-4px_rgba(59,130,246,0.7)]">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}