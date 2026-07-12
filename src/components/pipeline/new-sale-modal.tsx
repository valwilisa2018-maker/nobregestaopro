import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ShoppingCart, Loader2 } from "lucide-react";
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
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="h-5 w-5 text-primary" /> Nova Venda
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2">
            <Label>Vincular a contato existente (opcional)</Label>
            <Select value={contactId || "none"} onValueChange={(v) => v === "none" ? setContactId("") : pickContact(v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar contato" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— Digitar manualmente —</SelectItem>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name || c.phone}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Nome do cliente *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome completo" />
            </div>
            <div className="grid gap-2">
              <Label>Telefone / WhatsApp</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="55XXXXXXXXXXX" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Empresa</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Razão social / Nome fantasia" />
            </div>
            <div className="grid gap-2">
              <Label>CPF / CNPJ</Label>
              <Input value={document} onChange={(e) => setDocument(e.target.value)} placeholder="000.000.000-00" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>Forma de pagamento</Label>
              <Select value={payment} onValueChange={setPayment}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAYMENTS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>Etapa inicial do pipeline *</Label>
              <Select value={stageId} onValueChange={setStageId}>
                <SelectTrigger><SelectValue placeholder="Escolha a etapa" /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Nº da Nota Fiscal</Label>
            <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="Ex: 000123" />
          </div>

          <div className="grid gap-2">
            <Label>Vendedor</Label>
            <Input value={sellerName} onChange={(e) => setSellerName(e.target.value)} placeholder="Nome do vendedor" />
          </div>

          <div className="grid gap-2">
            <Label>Status do pagamento</Label>
            <div className="grid grid-cols-3 gap-2">
              {([
                { v: "paid", label: "Pago" },
                { v: "partial", label: "Parcial" },
                { v: "pending", label: "Pendente" },
              ] as const).map((o) => (
                <Button key={o.v} type="button" size="sm"
                  variant={paymentStatus === o.v ? "default" : "outline"}
                  onClick={() => setPaymentStatus(o.v)}>
                  {o.label}
                </Button>
              ))}
            </div>
            {paymentStatus === "partial" && (
              <div className="grid gap-1 mt-2">
                <Label className="text-xs">Valor da entrada (R$)</Label>
                <Input type="number" min={0} step="0.01" value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)} placeholder="0,00" />
                <p className="text-[11px] text-muted-foreground">
                  Restante: <strong className="tabular-nums">{formatBRL(Math.max(0, total - Math.round((parseFloat(downPayment) || 0) * 100)))}</strong>
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Produtos *</Label>
              <Button size="sm" variant="outline" onClick={addItem} type="button">
                <Plus className="h-3 w-3" /> Adicionar
              </Button>
            </div>
            {items.length === 0 && (
              <p className="text-xs text-muted-foreground py-4 text-center border border-dashed rounded-lg">
                Nenhum produto. Clique em Adicionar.
              </p>
            )}
            {items.map((i) => (
              <div key={i.key} className="grid grid-cols-[1fr_80px_110px_36px] gap-2 items-end">
                <div className="grid gap-1">
                  <Select value={i.product_id ?? ""} onValueChange={(v) => pickProduct(i.key, v)}>
                    <SelectTrigger><SelectValue placeholder="Produto" /></SelectTrigger>
                    <SelectContent>
                      {products.length === 0 && <div className="p-2 text-xs text-muted-foreground">Nenhum produto configurado. Vá à aba "Produtos".</div>}
                      {products.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name} — {formatBRL(p.price_cents)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  type="number" min={1}
                  value={i.quantity}
                  onChange={(e) => patchItem(i.key, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                />
                <Input
                  type="number" min={0} step="0.01"
                  value={(i.unit_price_cents / 100).toFixed(2)}
                  onChange={(e) => patchItem(i.key, { unit_price_cents: Math.round((parseFloat(e.target.value) || 0) * 100) })}
                />
                <Button variant="ghost" size="icon" onClick={() => removeItem(i.key)} type="button">
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>

          <div className="grid gap-2">
            <Label>Observação</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalhes da venda…" rows={3} />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-3">
            <span className="text-sm font-semibold">Total</span>
            <Badge className="text-base px-3 py-1 tabular-nums">{formatBRL(total)}</Badge>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            Salvar venda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}