import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Settings2, Loader2, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/payment-config")({
  head: () => ({ meta: [{ title: "Config. Pagamento — Admin Master" }] }),
  component: Page,
});

type Setting = { id: string; provider: string; mode: string; config: Record<string, unknown>; is_active: boolean };

function Page() {
  const [items, setItems] = useState<Setting[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ provider: "stripe", mode: "test", public_key: "", secret_key: "", is_active: false });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("payment_settings").select("*").order("created_at", { ascending: false });
    setItems((data as Setting[]) ?? []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    setSaving(true);
    const { error } = await supabase.from("payment_settings").insert({
      provider: form.provider, mode: form.mode,
      config: { public_key: form.public_key, secret_key: form.secret_key },
      is_active: form.is_active,
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configuração salva");
    setForm({ provider: "stripe", mode: "test", public_key: "", secret_key: "", is_active: false });
    load();
  };
  const toggle = async (s: Setting) => {
    await supabase.from("payment_settings").update({ is_active: !s.is_active }).eq("id", s.id);
    load();
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir configuração?")) return;
    await supabase.from("payment_settings").delete().eq("id", id);
    load();
  };

  return (
    <PageShell title="Configuração de pagamento" description="Gerencie chaves do gateway (Stripe, Paddle, etc.)."
      icon={<Settings2 className="h-6 w-6" />} status="ativo">
      <Card><CardContent className="p-6 space-y-4 max-w-2xl">
        <h3 className="font-semibold">Nova configuração</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2"><Label>Provider</Label>
            <Select value={form.provider} onValueChange={v => setForm({ ...form, provider: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stripe">Stripe</SelectItem>
                <SelectItem value="paddle">Paddle</SelectItem>
                <SelectItem value="mercadopago">Mercado Pago</SelectItem>
                <SelectItem value="pix">PIX Manual</SelectItem>
              </SelectContent>
            </Select></div>
          <div className="space-y-2"><Label>Modo</Label>
            <Select value={form.mode} onValueChange={v => setForm({ ...form, mode: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="test">Teste</SelectItem>
                <SelectItem value="live">Produção</SelectItem>
              </SelectContent>
            </Select></div>
        </div>
        <div className="space-y-2"><Label>Chave pública</Label>
          <Input value={form.public_key} onChange={e => setForm({ ...form, public_key: e.target.value })} /></div>
        <div className="space-y-2"><Label>Chave secreta</Label>
          <Input type="password" value={form.secret_key} onChange={e => setForm({ ...form, secret_key: e.target.value })} /></div>
        <div className="flex items-center gap-2">
          <Switch checked={form.is_active} onCheckedChange={v => setForm({ ...form, is_active: v })} />
          <span className="text-sm">Ativar após salvar</span>
        </div>
        <Button onClick={add} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} <Plus className="h-4 w-4" /> Salvar</Button>
      </CardContent></Card>

      <div className="mt-4 space-y-2">
        {loading ? <Loader2 className="h-5 w-5 animate-spin text-primary mx-auto" /> :
          items.map(s => (
            <Card key={s.id}><CardContent className="p-4 flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{s.provider}</span>
                  <Badge variant="outline">{s.mode}</Badge>
                  {s.is_active && <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">Ativo</Badge>}
                </div>
              </div>
              <Switch checked={s.is_active} onCheckedChange={() => toggle(s)} />
              <Button size="icon" variant="ghost" onClick={() => remove(s.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
            </CardContent></Card>
          ))}
      </div>
    </PageShell>
  );
}