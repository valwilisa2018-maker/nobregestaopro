import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Plus,
  Package,
  Edit3,
  Trash2,
  Loader2,
  ImagePlus,
  X,
  Box,
  Cloud,
  Wrench,
  Save,
  Tag,
  Wallet,
  ListOrdered,
  Pencil,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";
import { formatBRL } from "./types";

type ProductType = "physical" | "digital" | "service" | "";

type Product = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  active: boolean;
  product_type: string | null;
  category: string | null;
  brand: string | null;
  sku: string | null;
  unit: string | null;
  stock_quantity: number | null;
  cost_cents: number | null;
  weight_grams: number | null;
  width_cm: number | null;
  height_cm: number | null;
  length_cm: number | null;
  digital_url: string | null;
  access_duration_days: number | null;
  service_duration_minutes: number | null;
  service_location: string | null;
  warranty: string | null;
  notes: string | null;
  barcode: string | null;
  ncm: string | null;
  tax_percent: number | null;
  discount_percent: number | null;
  stock_min: number | null;
  supplier: string | null;
  delivery_days: number | null;
  shipping_cents: number | null;
  license_type: string | null;
  file_size_mb: number | null;
  download_limit: number | null;
  service_modality: string | null;
  service_recurrence: string | null;
  max_attendees: number | null;
  tags: string | null;
};

const IMG_KEY = (uid: string, pid: string) => `sale_product_img:${uid}:${pid}`;

const emptyForm = {
  name: "",
  description: "",
  price: "",
  cost: "",
  active: true,
  product_type: "" as ProductType,
  category: "",
  brand: "",
  sku: "",
  unit: "un",
  stock_quantity: "",
  weight_grams: "",
  width_cm: "",
  height_cm: "",
  length_cm: "",
  digital_url: "",
  access_duration_days: "",
  service_duration_minutes: "",
  service_location: "",
  warranty: "",
  notes: "",
  barcode: "",
  ncm: "",
  tax_percent: "",
  discount_percent: "",
  stock_min: "",
  supplier: "",
  delivery_days: "",
  shipping: "",
  license_type: "",
  file_size_mb: "",
  download_limit: "",
  service_modality: "",
  service_recurrence: "",
  max_attendees: "",
  tags: "",
};

const typeMeta: Record<
  Exclude<ProductType, "">,
  { label: string; icon: typeof Box; color: string }
> = {
  physical: {
    label: "Físico",
    icon: Box,
    color: "bg-blue-500/15 text-blue-500 border-blue-500/30",
  },
  digital: {
    label: "Digital",
    icon: Cloud,
    color: "bg-purple-500/15 text-purple-500 border-purple-500/30",
  },
  service: {
    label: "Serviço",
    icon: Wrench,
    color: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30",
  },
};

export function SaleProductsConfig() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [image, setImage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [images, setImages] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    const { data: userRes } = await supabase.auth.getUser();
    const u = userRes.user?.id ?? null;
    setUid(u);
    if (!u) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("sale_products" as never)
      .select("*")
      .eq("user_id", u)
      .order("created_at", { ascending: false });
    const rows = (data as unknown as Product[]) || [];
    setProducts(rows);
    const map: Record<string, string> = {};
    for (const p of rows) {
      const img = localStorage.getItem(IMG_KEY(u, p.id));
      if (img) map[p.id] = img;
    }
    setImages(map);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm });
    setImage(null);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({
      name: p.name,
      description: p.description || "",
      price: (p.price_cents / 100).toFixed(2),
      cost: p.cost_cents != null ? (p.cost_cents / 100).toFixed(2) : "",
      active: p.active,
      product_type: ((p.product_type as ProductType) || "") as ProductType,
      category: p.category || "",
      brand: p.brand || "",
      sku: p.sku || "",
      unit: p.unit || "un",
      stock_quantity: p.stock_quantity?.toString() ?? "",
      weight_grams: p.weight_grams?.toString() ?? "",
      width_cm: p.width_cm?.toString() ?? "",
      height_cm: p.height_cm?.toString() ?? "",
      length_cm: p.length_cm?.toString() ?? "",
      digital_url: p.digital_url || "",
      access_duration_days: p.access_duration_days?.toString() ?? "",
      service_duration_minutes: p.service_duration_minutes?.toString() ?? "",
      service_location: p.service_location || "",
      warranty: p.warranty || "",
      notes: p.notes || "",
      barcode: p.barcode || "",
      ncm: p.ncm || "",
      tax_percent: p.tax_percent?.toString() ?? "",
      discount_percent: p.discount_percent?.toString() ?? "",
      stock_min: p.stock_min?.toString() ?? "",
      supplier: p.supplier || "",
      delivery_days: p.delivery_days?.toString() ?? "",
      shipping: p.shipping_cents != null ? (p.shipping_cents / 100).toFixed(2) : "",
      license_type: p.license_type || "",
      file_size_mb: p.file_size_mb?.toString() ?? "",
      download_limit: p.download_limit?.toString() ?? "",
      service_modality: p.service_modality || "",
      service_recurrence: p.service_recurrence || "",
      max_attendees: p.max_attendees?.toString() ?? "",
      tags: p.tags || "",
    });
    setImage(uid ? localStorage.getItem(IMG_KEY(uid, p.id)) : null);
    setOpen(true);
  };

  const onPickImage = async (file: File | null) => {
    if (!file) {
      setImage(null);
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem acima de 2MB. Escolha uma menor.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setImage(String(reader.result));
    reader.readAsDataURL(file);
  };

  const num = (v: string) => (v.trim() === "" ? null : Number(v));
  const int = (v: string) => (v.trim() === "" ? null : Math.round(Number(v)));

  const save = async () => {
    if (!form.name.trim()) {
      toast.error("Informe o nome do produto");
      return;
    }
    if (!uid) return;
    setSaving(true);
    try {
      const payload = {
        user_id: uid,
        name: form.name.trim(),
        description: form.description.trim() || null,
        price_cents: Math.round((parseFloat(form.price) || 0) * 100),
        cost_cents: form.cost.trim() ? Math.round(parseFloat(form.cost) * 100) : null,
        active: form.active,
        product_type: form.product_type || null,
        category: form.category.trim() || null,
        brand: form.brand.trim() || null,
        sku: form.sku.trim() || null,
        unit: form.unit.trim() || null,
        stock_quantity: int(form.stock_quantity),
        weight_grams: int(form.weight_grams),
        width_cm: num(form.width_cm),
        height_cm: num(form.height_cm),
        length_cm: num(form.length_cm),
        digital_url: form.digital_url.trim() || null,
        access_duration_days: int(form.access_duration_days),
        service_duration_minutes: int(form.service_duration_minutes),
        service_location: form.service_location.trim() || null,
        warranty: form.warranty.trim() || null,
        notes: form.notes.trim() || null,
        barcode: form.barcode.trim() || null,
        ncm: form.ncm.trim() || null,
        tax_percent: num(form.tax_percent),
        discount_percent: num(form.discount_percent),
        stock_min: int(form.stock_min),
        supplier: form.supplier.trim() || null,
        delivery_days: int(form.delivery_days),
        shipping_cents: form.shipping.trim() ? Math.round(parseFloat(form.shipping) * 100) : null,
        license_type: form.license_type.trim() || null,
        file_size_mb: num(form.file_size_mb),
        download_limit: int(form.download_limit),
        service_modality: form.service_modality.trim() || null,
        service_recurrence: form.service_recurrence.trim() || null,
        max_attendees: int(form.max_attendees),
        tags: form.tags.trim() || null,
      };
      let productId = editing?.id;
      if (editing) {
        const { error } = await supabase
          .from("sale_products" as never)
          .update(payload as never)
          .eq("id", editing.id)
          .eq("user_id", uid);
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from("sale_products" as never)
          .insert(payload as never)
          .select("id")
          .single();
        if (error) throw error;
        productId = (data as { id: string }).id;
      }
      if (productId) {
        try {
          if (image) localStorage.setItem(IMG_KEY(uid, productId), image);
          else localStorage.removeItem(IMG_KEY(uid, productId));
        } catch {
          toast.warning("Imagem não pôde ser salva no navegador (espaço cheio).");
        }
      }
      toast.success(editing ? "Produto atualizado" : "Produto criado");
      setOpen(false);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover este produto?")) return;
    if (!uid) return;
    const { error } = await supabase
      .from("sale_products" as never)
      .delete()
      .eq("id", id)
      .eq("user_id", uid);
    if (error) {
      toast.error(error.message);
      return;
    }
    try {
      localStorage.removeItem(IMG_KEY(uid, id));
    } catch {
      /* noop */
    }
    toast.success("Produto removido");
    await load();
  };

  const margin = useMemo(() => {
    const p = parseFloat(form.price) || 0;
    const c = parseFloat(form.cost) || 0;
    if (!p || !c) return null;
    return (((p - c) / p) * 100).toFixed(1);
  }, [form.price, form.cost]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> Produtos & Serviços
          </h3>
          <p className="text-xs text-muted-foreground">
            Cadastre produtos físicos, digitais ou serviços com todos os detalhes.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> Novo produto
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : products.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center">
            <Package className="h-10 w-10 text-muted-foreground/60 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">
              Nenhum produto cadastrado. Clique em "Novo produto" para começar.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => {
            const t = (p.product_type as Exclude<ProductType, "">) || null;
            const Meta = t ? typeMeta[t] : null;
            const img = images[p.id];
            return (
              <Card key={p.id} className="relative overflow-hidden group">
                {img && (
                  <div className="h-32 w-full overflow-hidden bg-muted">
                    <img src={img} alt={p.name} className="w-full h-full object-cover" />
                  </div>
                )}
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold truncate">{p.name}</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {Meta && (
                          <Badge variant="outline" className={`text-[10px] ${Meta.color}`}>
                            <Meta.icon className="h-2.5 w-2.5 mr-0.5" />
                            {Meta.label}
                          </Badge>
                        )}
                        {p.category && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.category}
                          </Badge>
                        )}
                        {p.brand && (
                          <Badge variant="outline" className="text-[10px]">
                            {p.brand}
                          </Badge>
                        )}
                        {p.sku && (
                          <Badge variant="outline" className="text-[10px] font-mono">
                            SKU {p.sku}
                          </Badge>
                        )}
                        {p.stock_quantity != null && (
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${p.stock_quantity <= 0 ? "text-destructive border-destructive/40" : ""}`}
                          >
                            Estoque {p.stock_quantity}
                          </Badge>
                        )}
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                          {p.description}
                        </p>
                      )}
                    </div>
                    <Badge variant={p.active ? "default" : "secondary"} className="shrink-0">
                      {p.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                  <p className="text-xl font-black tabular-nums text-primary">
                    {formatBRL(p.price_cents)}
                    <span className="text-xs font-normal text-muted-foreground">
                      /{p.unit || "un"}
                    </span>
                  </p>
                  <div className="flex gap-2 pt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => openEdit(p)}
                    >
                      <Edit3 className="h-3 w-3" /> Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(p.id)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto border-slate-800/70 bg-gradient-to-b from-background to-card text-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-3 text-2xl font-bold">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500/30 to-indigo-600/30 ring-1 ring-blue-500/40">
                <Package className="h-5 w-5 text-blue-400" />
              </span>
              {editing ? "Editar produto" : "Novo produto"}
            </DialogTitle>
          </DialogHeader>

          <Tabs defaultValue="basic" className="space-y-5">
            <TabsList className="grid grid-cols-4 w-full h-auto gap-1 rounded-xl bg-card/60 p-1 ring-1 ring-slate-800/80">
              <TabsTrigger
                value="basic"
                className="gap-2 rounded-lg py-2.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-600/30 data-[state=active]:to-indigo-600/20 data-[state=active]:text-blue-300 data-[state=active]:ring-1 data-[state=active]:ring-blue-500/50 data-[state=active]:shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]"
              >
                <Save className="h-4 w-4" /> Básico
              </TabsTrigger>
              <TabsTrigger
                value="details"
                className="gap-2 rounded-lg py-2.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-600/30 data-[state=active]:to-indigo-600/20 data-[state=active]:text-blue-300 data-[state=active]:ring-1 data-[state=active]:ring-blue-500/50"
              >
                <ListOrdered className="h-4 w-4" /> Detalhes
              </TabsTrigger>
              <TabsTrigger
                value="specific"
                className="gap-2 rounded-lg py-2.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-600/30 data-[state=active]:to-indigo-600/20 data-[state=active]:text-blue-300 data-[state=active]:ring-1 data-[state=active]:ring-blue-500/50"
              >
                <Pencil className="h-4 w-4" /> Específico
              </TabsTrigger>
              <TabsTrigger
                value="image"
                className="gap-2 rounded-lg py-2.5 data-[state=active]:bg-gradient-to-br data-[state=active]:from-blue-600/30 data-[state=active]:to-indigo-600/20 data-[state=active]:text-blue-300 data-[state=active]:ring-1 data-[state=active]:ring-blue-500/50"
              >
                <ImageIcon className="h-4 w-4" /> Imagem
              </TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="space-y-5">
              <div className="grid gap-2">
                <Label className="text-foreground font-semibold">
                  Nome <span className="text-blue-400">*</span>
                </Label>
                <Input
                  placeholder="Digite o nome do produto"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="h-12 bg-card/60 border-slate-800 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/60 focus-visible:border-blue-500/60"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label className="text-foreground font-semibold">Tipo</Label>
                  <Select
                    value={form.product_type || "none"}
                    onValueChange={(v) =>
                      setForm({ ...form, product_type: (v === "none" ? "" : v) as ProductType })
                    }
                  >
                    <SelectTrigger className="h-12 bg-card/60 border-slate-800 text-foreground [&_svg]:text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Tag className="h-4 w-4 text-muted-foreground" />
                        <SelectValue />
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Não definido</SelectItem>
                      <SelectItem value="physical">📦 Físico</SelectItem>
                      <SelectItem value="digital">☁️ Digital</SelectItem>
                      <SelectItem value="service">🔧 Serviço</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label className="text-foreground font-semibold">Status</Label>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, active: true })}
                      className={`flex-1 h-12 rounded-lg px-4 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all ${form.active ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-foreground shadow-[0_0_20px_-4px_rgba(59,130,246,0.7)] ring-1 ring-blue-400/50" : "bg-card/60 text-muted-foreground ring-1 ring-slate-800 hover:bg-muted/60"}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${form.active ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" : "bg-slate-500"}`}
                      />
                      Ativo
                    </button>
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, active: false })}
                      className={`flex-1 h-12 rounded-lg px-4 text-sm font-semibold inline-flex items-center justify-center gap-2 transition-all ${!form.active ? "bg-gradient-to-r from-slate-700 to-slate-800 text-foreground ring-1 ring-slate-600" : "bg-card/60 text-muted-foreground ring-1 ring-slate-800 hover:bg-muted/60"}`}
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${!form.active ? "bg-slate-300" : "bg-slate-600"}`}
                      />
                      Inativo
                    </button>
                  </div>
                </div>
              </div>
              <div className="grid gap-2">
                <Label className="text-foreground font-semibold">Descrição</Label>
                <Textarea
                  placeholder="Digite uma descrição para o produto (opcional)"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={4}
                  className="bg-card/60 border-slate-800 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/60"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="grid gap-2">
                  <Label className="text-foreground font-semibold">
                    Preço (R$) <span className="text-blue-400">*</span>
                  </Label>
                  <div className="relative">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="R$ 0,00"
                      value={form.price}
                      onChange={(e) => setForm({ ...form, price: e.target.value })}
                      className="h-12 pl-9 bg-card/60 border-slate-800 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-foreground font-semibold">Custo (R$)</Label>
                  <div className="relative">
                    <Wallet className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      placeholder="R$ 0,00"
                      value={form.cost}
                      onChange={(e) => setForm({ ...form, cost: e.target.value })}
                      className="h-12 pl-9 bg-card/60 border-slate-800 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Label className="text-foreground font-semibold">Unidade</Label>
                  <div className="relative">
                    <Box className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="un, kg, hr..."
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="h-12 pl-9 bg-card/60 border-slate-800 text-foreground placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-blue-500/60"
                    />
                  </div>
                </div>
              </div>
              {margin && (
                <p className="text-xs text-muted-foreground">
                  Margem: <span className="font-bold text-blue-400">{margin}%</span>
                </p>
              )}
            </TabsContent>

            <TabsContent value="details" className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Categoria</Label>
                  <Input
                    placeholder="Ex: Eletrônicos"
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Marca</Label>
                  <Input
                    placeholder="Ex: Apple"
                    value={form.brand}
                    onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>SKU / Código</Label>
                  <Input
                    placeholder="Ex: PROD-001"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Garantia</Label>
                  <Input
                    placeholder="Ex: 12 meses"
                    value={form.warranty}
                    onChange={(e) => setForm({ ...form, warranty: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Código de barras</Label>
                  <Input
                    placeholder="EAN/UPC"
                    value={form.barcode}
                    onChange={(e) => setForm({ ...form, barcode: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>NCM</Label>
                  <Input
                    placeholder="0000.00.00"
                    value={form.ncm}
                    onChange={(e) => setForm({ ...form, ncm: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Fornecedor</Label>
                  <Input
                    placeholder="Nome do fornecedor"
                    value={form.supplier}
                    onChange={(e) => setForm({ ...form, supplier: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Imposto (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.tax_percent}
                    onChange={(e) => setForm({ ...form, tax_percent: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Desconto padrão (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={form.discount_percent}
                    onChange={(e) => setForm({ ...form, discount_percent: e.target.value })}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label>Tags (separadas por vírgula)</Label>
                <Input
                  placeholder="promocao, top-vendas, novo"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Observações internas</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </TabsContent>

            <TabsContent value="specific" className="space-y-3">
              {form.product_type === "physical" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Estoque</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.stock_quantity}
                        onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Peso (g)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.weight_grams}
                        onChange={(e) => setForm({ ...form, weight_grams: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Estoque mínimo</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.stock_min}
                        onChange={(e) => setForm({ ...form, stock_min: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Prazo de entrega (dias)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.delivery_days}
                        onChange={(e) => setForm({ ...form, delivery_days: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2 col-span-2">
                      <Label>Frete padrão (R$)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.shipping}
                        onChange={(e) => setForm({ ...form, shipping: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="grid gap-2">
                      <Label>Largura (cm)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.width_cm}
                        onChange={(e) => setForm({ ...form, width_cm: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Altura (cm)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.height_cm}
                        onChange={(e) => setForm({ ...form, height_cm: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Comprimento (cm)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.length_cm}
                        onChange={(e) => setForm({ ...form, length_cm: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
              {form.product_type === "digital" && (
                <>
                  <div className="grid gap-2">
                    <Label>URL de entrega / acesso</Label>
                    <Input
                      placeholder="https://..."
                      value={form.digital_url}
                      onChange={(e) => setForm({ ...form, digital_url: e.target.value })}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Duração do acesso (dias)</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Vazio = vitalício"
                        value={form.access_duration_days}
                        onChange={(e) => setForm({ ...form, access_duration_days: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Tipo de licença</Label>
                      <Select
                        value={form.license_type || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, license_type: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="single">Uso único</SelectItem>
                          <SelectItem value="multi">Multiusuário</SelectItem>
                          <SelectItem value="subscription">Assinatura</SelectItem>
                          <SelectItem value="lifetime">Vitalícia</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Tamanho do arquivo (MB)</Label>
                      <Input
                        type="number"
                        min={0}
                        step="0.1"
                        value={form.file_size_mb}
                        onChange={(e) => setForm({ ...form, file_size_mb: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Limite de downloads</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Vazio = ilimitado"
                        value={form.download_limit}
                        onChange={(e) => setForm({ ...form, download_limit: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
              {form.product_type === "service" && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="grid gap-2">
                      <Label>Duração (minutos)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.service_duration_minutes}
                        onChange={(e) =>
                          setForm({ ...form, service_duration_minutes: e.target.value })
                        }
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Local do serviço</Label>
                      <Input
                        placeholder="Presencial, Online..."
                        value={form.service_location}
                        onChange={(e) => setForm({ ...form, service_location: e.target.value })}
                      />
                    </div>
                    <div className="grid gap-2">
                      <Label>Modalidade</Label>
                      <Select
                        value={form.service_modality || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, service_modality: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          <SelectItem value="presencial">Presencial</SelectItem>
                          <SelectItem value="online">Online</SelectItem>
                          <SelectItem value="hibrido">Híbrido</SelectItem>
                          <SelectItem value="domicilio">A domicílio</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Recorrência</Label>
                      <Select
                        value={form.service_recurrence || "none"}
                        onValueChange={(v) =>
                          setForm({ ...form, service_recurrence: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Avulso</SelectItem>
                          <SelectItem value="weekly">Semanal</SelectItem>
                          <SelectItem value="biweekly">Quinzenal</SelectItem>
                          <SelectItem value="monthly">Mensal</SelectItem>
                          <SelectItem value="yearly">Anual</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label>Capacidade máxima</Label>
                      <Input
                        type="number"
                        min={0}
                        placeholder="Nº de participantes"
                        value={form.max_attendees}
                        onChange={(e) => setForm({ ...form, max_attendees: e.target.value })}
                      />
                    </div>
                  </div>
                </>
              )}
              {!form.product_type && (
                <p className="text-xs text-muted-foreground text-center py-8">
                  Selecione um tipo (Físico, Digital ou Serviço) na aba <b>Básico</b> para ver os
                  campos específicos.
                </p>
              )}
            </TabsContent>

            <TabsContent value="image" className="space-y-3">
              <p className="text-xs text-muted-foreground">
                A imagem fica salva apenas no seu navegador (não é enviada ao servidor). Máx. 2 MB.
              </p>
              {image ? (
                <div className="relative">
                  <img
                    src={image}
                    alt="Preview"
                    className="w-full max-h-64 object-contain rounded-lg border bg-muted"
                  />
                  <Button
                    size="sm"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setImage(null)}
                  >
                    <X className="h-3 w-3" /> Remover
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 cursor-pointer hover:bg-muted/50 transition">
                  <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    Clique para escolher uma imagem
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
                  />
                </label>
              )}
            </TabsContent>
          </Tabs>

          <DialogFooter className="border-t border-slate-800/70 pt-4 mt-2">
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={saving}
              className="h-11 px-6 bg-transparent border-slate-700 text-foreground hover:bg-muted/60 hover:text-foreground"
            >
              Cancelar
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="h-11 px-6 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-foreground font-semibold shadow-[0_0_24px_-4px_rgba(59,130,246,0.7)] ring-1 ring-blue-400/50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
