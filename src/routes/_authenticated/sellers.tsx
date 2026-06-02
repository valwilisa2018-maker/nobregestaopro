import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, ImagePlus } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/auth";

export const Route = createFileRoute("/_authenticated/sellers")({
  component: SellersPage,
});

function SellerAvatar({ path, name }: { path: string | null; name: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) { setUrl(null); return; }
    if (path.startsWith("http")) { setUrl(path); return; }
    supabase.storage.from("seller-avatars").createSignedUrl(path, 3600).then(({ data }) => {
      if (alive) setUrl(data?.signedUrl ?? null);
    });
    return () => { alive = false; };
  }, [path]);
  return (
    <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium overflow-hidden shrink-0">
      {url ? <img src={url} alt={name} className="w-full h-full object-cover" /> : (name?.charAt(0)?.toUpperCase() ?? "?")}
    </div>
  );
}

type SellerForm = {
  id?: string;
  name: string;
  phone: string;
  email: string;
  monthly_goal: string;
  commission_rate: string;
  avatar_url: string | null;
};

const emptyForm: SellerForm = { name: "", phone: "", email: "", monthly_goal: "0", commission_rate: "0", avatar_url: null };

function SellersPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<SellerForm>(emptyForm);
  const [uploading, setUploading] = useState(false);
  const q = useQuery({
    queryKey: ["sellers-page"],
    queryFn: async () => (await supabase.from("sellers").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const openNew = () => { setForm(emptyForm); setOpen(true); };
  const openEdit = (s: any) => {
    setForm({
      id: s.id,
      name: s.name ?? "",
      phone: s.phone ?? "",
      email: s.email ?? "",
      monthly_goal: String(s.monthly_goal ?? 0),
      commission_rate: String(s.commission_rate ?? 0),
      avatar_url: s.avatar_url ?? null,
    });
    setOpen(true);
  };
  const uploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("seller-avatars").upload(path, file, { upsert: true, contentType: file.type });
      if (error) { toast.error(error.message); return; }
      setForm((f) => ({ ...f, avatar_url: path }));
    } finally {
      setUploading(false);
    }
  };
  const save = async () => {
    if (!form.name) return toast.error("Nome obrigatório");
    const payload = {
      name: form.name,
      phone: form.phone || null,
      email: form.email || null,
      monthly_goal: Number(form.monthly_goal),
      commission_rate: Number(form.commission_rate),
      avatar_url: form.avatar_url,
    };
    const { error } = form.id
      ? await supabase.from("sellers").update(payload).eq("id", form.id)
      : await supabase.from("sellers").insert(payload);
    if (error) toast.error(error.message);
    else { toast.success(form.id ? "Vendedor atualizado" : "Vendedor cadastrado"); setOpen(false); setForm(emptyForm); qc.invalidateQueries(); }
  };
  const toggleActive = async (id: string, active: boolean) => {
    const { error } = await supabase.from("sellers").update({ active }).eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success(active ? "Vendedor ativado" : "Vendedor desativado"); qc.invalidateQueries(); }
  };
  const remove = async (id: string, name: string) => {
    if (!window.confirm(`Excluir o vendedor "${name}"? Esta ação não pode ser desfeita.`)) return;
    const { count: salesCount } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("seller_id", id);
    const linked = salesCount ?? 0;
    if (linked > 0) {
      toast.error(`Não é possível excluir: ${linked} venda(s) vinculada(s). Desative-o em vez disso.`);
      return;
    }
    const { error } = await supabase.from("sellers").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Vendedor excluído"); qc.invalidateQueries(); }
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-3xl font-bold tracking-tight">Vendedores</h1><p className="text-muted-foreground">Equipe comercial</p></div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button onClick={openNew}><Plus className="w-4 h-4 mr-2" />Novo vendedor</Button></DialogTrigger>
          <DialogContent><DialogHeader><DialogTitle>{form.id ? "Editar vendedor" : "Novo vendedor"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <SellerAvatar path={form.avatar_url} name={form.name || "?"} />
                <div className="flex gap-2">
                  <label className="inline-flex">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); e.target.value = ""; }}
                    />
                    <Button asChild variant="outline" size="sm" disabled={uploading}>
                      <span><ImagePlus className="w-4 h-4 mr-2" />{uploading ? "Enviando..." : (form.avatar_url ? "Trocar foto" : "Adicionar foto")}</span>
                    </Button>
                  </label>
                  {form.avatar_url && (
                    <Button variant="ghost" size="sm" onClick={() => setForm({ ...form, avatar_url: null })}>Remover</Button>
                  )}
                </div>
              </div>
              <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Meta mensal</Label><Input type="number" value={form.monthly_goal} onChange={(e) => setForm({ ...form, monthly_goal: e.target.value })} /></div>
              <div><Label>Comissão (%)</Label><Input type="number" value={form.commission_rate} onChange={(e) => setForm({ ...form, commission_rate: e.target.value })} /></div>
            </div>
            <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow><TableHead>Nome</TableHead><TableHead>Contato</TableHead><TableHead className="text-right">Meta</TableHead><TableHead>Comissão</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
          <TableBody>
            {(q.data ?? []).map((s: any) => (
              <TableRow key={s.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-3">
                    <SellerAvatar path={s.avatar_url} name={s.name} />
                    <span>{s.name}</span>
                  </div>
                </TableCell>
                <TableCell><div className="text-sm">{s.phone}</div><div className="text-xs text-muted-foreground">{s.email}</div></TableCell>
                <TableCell className="text-right">{formatCurrency(s.monthly_goal)}</TableCell>
                <TableCell>{s.commission_rate}%</TableCell>
                <TableCell><Badge variant={s.active ? "default" : "secondary"}>{s.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end">
                    <Button variant="outline" size="sm" onClick={() => openEdit(s)}>
                      <Pencil className="w-4 h-4 mr-1" />Editar
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => toggleActive(s.id, !s.active)}>
                      {s.active ? "Desativar" : "Ativar"}
                    </Button>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(s.id, s.name)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Sem vendedores</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent></Card>
    </div>
  );
}