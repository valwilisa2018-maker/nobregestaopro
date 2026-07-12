import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Package, Edit3, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "./types";

type Product = {
  id: string; name: string; description: string | null;
  price_cents: number; active: boolean;
};

export function SaleProductsConfig() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ name: "", description: "", price: "", active: true });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) { setLoading(false); return; }
    const { data } = await supabase.from("sale_products" as never)
      .select("*").eq("user_id", uid).order("created_at", { ascending: false });
    setProducts(((data as unknown) as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ name: "", description: "", price: "", active: true });
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ name: p.name, description: p.description || "", price: (p.price_cents / 100).toFixed(2), active: p.active });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name.trim()) { toast.error("Informe o nome do produto"); return; }
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes.user?.id;
      if (!uid) return;
      const payload = {
        user_id: uid,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: Math.round((parseFloat(form.price) || 0) * 100),
        active: form.active,
      };
      if (editing) {
        const { error } = await supabase.from("sale_products" as never).update(payload as never).eq("id", editing.id).eq("user_id", uid);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("sale_products" as never).insert(payload as never);
        if (error) throw error;
      }
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      setOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este produto?")) return;
    const { data: userRes } = await supabase.auth.getUser();
    const uid = userRes.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("sale_products" as never).delete().eq("id", id).eq("user_id", uid);
    if (error) { toast.error(error.message); return; }
    toast.success("Produto removido");
    await load();
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Produtos & Serviços
          </h3>
          <p className="text-xs text-muted-foreground">Configure o catálogo que aparece no modal de Nova Venda.</p>
        </div>
        <Button onClick={openCreate}><Plus className="h-4 w-4" /> Novo produto</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : products.length === 0 ? (
        <Card><CardContent className="p-12 text-center">
          <Package className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Nenhum produto cadastrado. Clique em "Novo produto" para começar.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <Card key={p.id} className="relative overflow-hidden">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold truncate">{p.name}</p>
                    {p.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{p.description}</p>}
                  </div>
                  <Badge variant={p.active ? "default" : "secondary"} className="shrink-0">{p.active ? "Ativo" : "Inativo"}</Badge>
                </div>
                <p className="text-xl font-black tabular-nums text-primary">{formatBRL(p.price_cents)}</p>
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(p)}>
                    <Edit3 className="h-3 w-3" /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar produto" : "Novo produto"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-2">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid gap-2">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-2">
                <Label>Preço (R$) *</Label>
                <Input type="number" min={0} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </div>
              <div className="grid gap-2">
                <Label>Status</Label>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant={form.active ? "default" : "outline"} onClick={() => setForm({ ...form, active: true })}>Ativo</Button>
                  <Button type="button" size="sm" variant={!form.active ? "default" : "outline"} onClick={() => setForm({ ...form, active: false })}>Inativo</Button>
                </div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}