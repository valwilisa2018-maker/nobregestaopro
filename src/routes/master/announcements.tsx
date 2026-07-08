import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Megaphone, Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/announcements")({
  head: () => ({ meta: [{ title: "Anúncios — Admin Master" }] }),
  component: Page,
});

type Announcement = {
  id: string; title: string; body: string; severity: string;
  cta_label: string | null; cta_url: string | null;
  starts_at: string; ends_at: string | null; is_active: boolean;
};
const empty: Omit<Announcement, "id"> = {
  title: "", body: "", severity: "info", cta_label: "", cta_url: "",
  starts_at: new Date().toISOString(), ends_at: null, is_active: true,
};

function Page() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Announcement | null>(null);
  const [form, setForm] = useState<Omit<Announcement, "id">>(empty);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("announcements").select("*").order("created_at", { ascending: false });
    setItems((data as Announcement[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.error("Título e mensagem obrigatórios");
    setSaving(true);
    const q = editing
      ? supabase.from("announcements").update(form).eq("id", editing.id)
      : supabase.from("announcements").insert(form);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Anúncio atualizado" : "Anúncio criado");
    setOpen(false); load();
  };
  const remove = async (a: Announcement) => {
    if (!confirm(`Excluir "${a.title}"?`)) return;
    const { error } = await supabase.from("announcements").delete().eq("id", a.id);
    if (error) return toast.error(error.message);
    load();
  };

  return (
    <PageShell title="Anúncios" description="Recados e atualizações exibidos como modal aos clientes."
      icon={<Megaphone className="h-6 w-6" />} status="ativo"
      actions={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="h-4 w-4" /> Novo anúncio</Button>}
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-3">
          {items.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4 flex gap-3 items-start">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold">{a.title}</h3>
                    <Badge variant="outline">{a.severity}</Badge>
                    {!a.is_active && <Badge variant="secondary">Inativo</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { setEditing(a); setForm(a); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove(a)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
              </CardContent>
            </Card>
          ))}
          {items.length === 0 && <Card><CardContent className="p-12 text-center text-muted-foreground">Nenhum anúncio criado.</CardContent></Card>}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "Editar" : "Novo"} anúncio</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2 max-h-[60vh] overflow-y-auto pr-1">
            <div className="space-y-2"><Label>Título</Label>
              <Input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} /></div>
            <div className="space-y-2"><Label>Mensagem</Label>
              <Textarea rows={5} value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Severidade</Label>
                <Select value={form.severity} onValueChange={v => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="success">Sucesso</SelectItem>
                    <SelectItem value="warning">Aviso</SelectItem>
                  </SelectContent>
                </Select></div>
              <div className="flex items-end gap-2 pb-1">
                <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
                <span className="text-sm">Ativo</span>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2"><Label>Texto do botão</Label>
                <Input value={form.cta_label ?? ""} onChange={e => setForm({ ...form, cta_label: e.target.value })} /></div>
              <div className="space-y-2"><Label>URL do botão</Label>
                <Input value={form.cta_url ?? ""} onChange={e => setForm({ ...form, cta_url: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}