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
import { Megaphone, Loader2, Plus, Pencil, Trash2, Eye, EyeOff, Info, CheckCircle2, AlertTriangle, Wrench, Sparkles, Construction } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/announcements")({
  head: () => ({ meta: [{ title: "Anúncios — Admin Master" }] }),
  component: Page,
});

type Announcement = {
  id: string; title: string; body: string; severity: string;
  cta_label: string | null; cta_url: string | null;
  starts_at: string; ends_at: string | null; is_active: boolean;
  lockdown: boolean;
};
const empty: Omit<Announcement, "id"> = {
  title: "", body: "", severity: "info", cta_label: "", cta_url: "",
  starts_at: new Date().toISOString(), ends_at: null, is_active: true, lockdown: false,
};

type Template = {
  key: string; label: string; icon: typeof Info; accent: string;
  data: Omit<Announcement, "id">;
};
const TEMPLATES: Template[] = [
  { key: "maintenance", label: "Manutenção", icon: Wrench, accent: "from-amber-500 to-orange-600",
    data: { ...empty, severity: "maintenance", title: "Estamos em manutenção",
      body: "Nossa equipe está trabalhando em melhorias na plataforma. Algumas funções podem ficar temporariamente indisponíveis. Obrigado pela paciência!",
      cta_label: "", cta_url: "" } },
  { key: "lockdown", label: "Manutenção Total", icon: Construction, accent: "from-red-500 to-amber-600",
    data: { ...empty, severity: "maintenance", lockdown: true, title: "Plataforma em manutenção",
      body: "Estamos trabalhando para melhorias na plataforma, para que você não tenha instabilidades ou frustrações no uso. Foi necessário tirar a plataforma do ar por um período curto para manutenção periódica e necessária, garantindo que tudo funcione 100% redondo. Obrigado pela paciência!",
      cta_label: "", cta_url: "" } },
  { key: "update", label: "Atualização", icon: Sparkles, accent: "from-fuchsia-500 to-indigo-600",
    data: { ...empty, severity: "success", title: "Nova atualização disponível",
      body: "Adicionamos novos recursos à plataforma. Confira as novidades e aproveite ao máximo!",
      cta_label: "Ver novidades", cta_url: "" } },
  { key: "info", label: "Informação", icon: Info, accent: "from-sky-500 to-blue-600",
    data: { ...empty, severity: "info", title: "Comunicado importante",
      body: "Temos uma informação importante para compartilhar com você. Leia com atenção.",
      cta_label: "", cta_url: "" } },
  { key: "warning", label: "Aviso", icon: AlertTriangle, accent: "from-amber-500 to-red-500",
    data: { ...empty, severity: "warning", title: "Aviso importante",
      body: "Fique atento a esta informação para evitar problemas no uso da plataforma.",
      cta_label: "", cta_url: "" } },
  { key: "success", label: "Sucesso", icon: CheckCircle2, accent: "from-emerald-500 to-teal-600",
    data: { ...empty, severity: "success", title: "Tudo certo!",
      body: "Uma boa notícia para compartilhar com você. Confira os detalhes.",
      cta_label: "", cta_url: "" } },
];

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
  const toggleActive = async (a: Announcement) => {
    const { error } = await supabase.from("announcements").update({ is_active: !a.is_active }).eq("id", a.id);
    if (error) return toast.error(error.message);
    toast.success(!a.is_active ? "Anúncio ativado" : "Anúncio desativado");
    load();
  };
  const openTemplate = (t: Template) => { setEditing(null); setForm(t.data); setOpen(true); };
  const lockdownActive = items.some(a => a.is_active && a.lockdown);

  return (
    <PageShell title="Anúncios" description="Recados e atualizações exibidos como modal aos clientes."
      icon={<Megaphone className="h-6 w-6" />} status="ativo"
      actions={<Button onClick={() => { setEditing(null); setForm(empty); setOpen(true); }}><Plus className="h-4 w-4" /> Novo anúncio</Button>}
    >
      {lockdownActive && (
        <div className="rounded-xl border border-red-500/40 bg-gradient-to-r from-red-500/10 via-amber-500/10 to-red-500/10 p-4 flex items-start gap-3">
          <Construction className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="text-sm">
            <div className="font-semibold text-red-500">Manutenção Total ativa</div>
            <div className="text-muted-foreground">Todos os clientes veem a página de manutenção e não conseguem logar. Apenas usuários Master têm acesso. Desative o anúncio para liberar a plataforma.</div>
          </div>
        </div>
      )}

      {/* Templates prontos */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {TEMPLATES.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => openTemplate(t)}
              className="group relative overflow-hidden rounded-xl border border-border bg-card p-4 text-left transition hover:border-primary/50 hover:shadow-md">
              <div className={`mb-2 grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${t.accent} text-white shadow-sm`}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="text-sm font-semibold">{t.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.data.title}</div>
            </button>
          );
        })}
      </div>

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
                    {a.severity === "maintenance" && a.is_active && <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30" variant="outline">Barra ativa</Badge>}
                    {a.lockdown && a.is_active && <Badge className="bg-red-500/15 text-red-500 border-red-500/40" variant="outline"><Construction className="h-3 w-3 mr-1" /> Manutenção total</Badge>}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{a.body}</p>
                </div>
                <Button size="icon" variant="ghost" onClick={() => toggleActive(a)} title={a.is_active ? "Desativar" : "Ativar"}>
                  {a.is_active ? <Eye className="h-4 w-4 text-primary" /> : <EyeOff className="h-4 w-4 text-muted-foreground" />}
                </Button>
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
                    <SelectItem value="maintenance">Manutenção (barra fixa)</SelectItem>
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
            <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 flex items-start gap-3">
              <Switch checked={form.lockdown} onCheckedChange={v => setForm({ ...form, lockdown: v, severity: v ? "maintenance" : form.severity })} />
              <div className="text-sm">
                <div className="font-semibold flex items-center gap-1.5"><Construction className="h-4 w-4 text-red-500" /> Manutenção total (bloquear plataforma)</div>
                <div className="text-xs text-muted-foreground mt-0.5">Enquanto este anúncio estiver ativo, todos os clientes veem uma página de manutenção e não conseguem logar. Apenas usuários Master têm acesso.</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3">
              <div className="sm:col-span-2 text-xs text-muted-foreground">
                Agende início e fim. Fora dessa janela o anúncio (e o bloqueio de manutenção) desaparece automaticamente — sem precisar desativar manualmente.
              </div>
              <div className="space-y-2">
                <Label>Início programado</Label>
                <Input
                  type="datetime-local"
                  value={toLocalInput(form.starts_at)}
                  onChange={e => setForm({ ...form, starts_at: fromLocalInput(e.target.value) ?? new Date().toISOString() })}
                />
              </div>
              <div className="space-y-2">
                <Label>Fim programado (expira sozinho)</Label>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={toLocalInput(form.ends_at)}
                    onChange={e => setForm({ ...form, ends_at: fromLocalInput(e.target.value) })}
                  />
                  {form.ends_at && (
                    <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, ends_at: null })}>Limpar</Button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {[15, 30, 60, 120, 240].map(m => (
                    <Button key={m} type="button" size="sm" variant="secondary"
                      onClick={() => setForm({ ...form, ends_at: new Date(Date.now() + m * 60_000).toISOString() })}>
                      +{m < 60 ? `${m}min` : `${m / 60}h`}
                    </Button>
                  ))}
                </div>
              </div>
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