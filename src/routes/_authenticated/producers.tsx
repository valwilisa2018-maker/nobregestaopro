import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Pencil, Upload } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/producers")({
  component: () => {
    const qc = useQueryClient();
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", specialty: "", phone: "", email: "" });
    const [editing, setEditing] = useState<any | null>(null);
    const [uploading, setUploading] = useState(false);
    const q = useQuery({ queryKey: ["producers-page"], queryFn: async () => (await supabase.from("producers").select("*").order("created_at", { ascending: false })).data ?? [] });
    const save = async () => {
      if (!form.name) return toast.error("Nome obrigatório");
      const { error } = await supabase.from("producers").insert(form);
      if (error) toast.error(error.message);
      else { toast.success("Produtor cadastrado"); setOpen(false); setForm({ name: "", specialty: "", phone: "", email: "" }); qc.invalidateQueries(); }
    };
    const saveEdit = async () => {
      if (!editing) return;
      if (!editing.name) return toast.error("Nome obrigatório");
      const { error } = await supabase.from("producers").update({
        name: editing.name,
        specialty: editing.specialty,
        phone: editing.phone,
        email: editing.email,
        avatar_url: editing.avatar_url,
      }).eq("id", editing.id);
      if (error) toast.error(error.message);
      else { toast.success("Produtor atualizado"); setEditing(null); qc.invalidateQueries(); }
    };
    const uploadAvatar = async (file: File) => {
      if (!editing) return;
      setUploading(true);
      try {
        const ext = file.name.split(".").pop() ?? "png";
        const path = `${editing.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("producer-avatars").upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        const { data } = supabase.storage.from("producer-avatars").getPublicUrl(path);
        setEditing({ ...editing, avatar_url: data.publicUrl });
        toast.success("Foto enviada");
      } catch (e: any) {
        toast.error(e.message ?? "Erro ao enviar foto");
      } finally {
        setUploading(false);
      }
    };
    const toggleActive = async (id: string, active: boolean) => {
      const { error } = await supabase.from("producers").update({ active }).eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success(active ? "Produtor ativado" : "Produtor desativado"); qc.invalidateQueries(); }
    };
    const remove = async (id: string, name: string) => {
      if (!window.confirm(`Excluir o produtor "${name}"? Esta ação não pode ser desfeita.`)) return;
      const { count: salesCount } = await supabase.from("sales").select("id", { count: "exact", head: true }).eq("producer_id", id);
      const { count: ordersCount } = await supabase.from("service_orders").select("id", { count: "exact", head: true }).eq("producer_id", id);
      const linked = (salesCount ?? 0) + (ordersCount ?? 0);
      if (linked > 0) {
        toast.error(`Não é possível excluir: ${linked} registro(s) vinculados. Desative-o em vez disso.`);
        return;
      }
      const { error } = await supabase.from("producers").delete().eq("id", id);
      if (error) toast.error(error.message);
      else { toast.success("Produtor excluído"); qc.invalidateQueries(); }
    };
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div><h1 className="text-3xl font-bold tracking-tight">Produtores</h1><p className="text-muted-foreground">Equipe de produção</p></div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Novo produtor</Button></DialogTrigger>
            <DialogContent><DialogHeader><DialogTitle>Novo produtor</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label>Nome</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Especialidade</Label><Input value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              </div>
              <DialogFooter><Button onClick={save}>Salvar</Button></DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Editar produtor</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div className="flex items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-muted overflow-hidden border-2 border-border flex items-center justify-center text-2xl font-bold text-muted-foreground">
                    {editing.avatar_url ? (
                      <img src={editing.avatar_url} alt={editing.name} className="w-full h-full object-cover" />
                    ) : (editing.name?.charAt(0)?.toUpperCase() ?? "?")}
                  </div>
                  <div className="flex-1">
                    <Label>Foto do produtor</Label>
                    <div className="flex gap-2 mt-1">
                      <Input type="file" accept="image/*" disabled={uploading} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAvatar(f); }} />
                      {editing.avatar_url && (
                        <Button variant="outline" size="sm" onClick={() => setEditing({ ...editing, avatar_url: null })}>Remover</Button>
                      )}
                    </div>
                  </div>
                </div>
                <div><Label>Nome</Label><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
                <div><Label>Especialidade</Label><Input value={editing.specialty ?? ""} onChange={(e) => setEditing({ ...editing, specialty: e.target.value })} /></div>
                <div><Label>Telefone</Label><Input value={editing.phone ?? ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
                <div><Label>E-mail</Label><Input value={editing.email ?? ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              </div>
            )}
            <DialogFooter><Button onClick={saveEdit} disabled={uploading}>Salvar</Button></DialogFooter>
          </DialogContent>
        </Dialog>
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}><CardContent className="p-0">
          <Table>
            <TableHeader><TableRow><TableHead>Foto</TableHead><TableHead>Nome</TableHead><TableHead>Especialidade</TableHead><TableHead>Qualidade</TableHead><TableHead>Prazo médio</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Ações</TableHead></TableRow></TableHeader>
            <TableBody>
              {(q.data ?? []).map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="w-10 h-10 rounded-full bg-muted overflow-hidden border flex items-center justify-center text-sm font-bold text-muted-foreground">
                      {p.avatar_url ? <img src={p.avatar_url} alt={p.name} className="w-full h-full object-cover" /> : (p.name?.charAt(0)?.toUpperCase() ?? "?")}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.specialty ?? "—"}</TableCell>
                  <TableCell>{Number(p.quality_score ?? 0).toFixed(1)} ⭐</TableCell>
                  <TableCell>{Number(p.average_delivery_days ?? 0).toFixed(1)} dias</TableCell>
                  <TableCell><Badge variant={p.active ? "default" : "secondary"}>{p.active ? "Ativo" : "Inativo"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end">
                      <Button variant="outline" size="sm" onClick={() => setEditing({ ...p })}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => toggleActive(p.id, !p.active)}>
                        {p.active ? "Desativar" : "Ativar"}
                      </Button>
                      <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => remove(p.id, p.name)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Sem produtores</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent></Card>
      </div>
    );
  },
});