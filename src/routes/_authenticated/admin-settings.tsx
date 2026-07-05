import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings, Save, Loader2, Zap, ShieldAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin-settings")({
  head: () => ({ meta: [{ title: "Configurações Globais — Admin" }] }),
  component: Page,
});

type EvoCfg = { url_api: string; api_key: string; webhook_base_url: string };

function Page() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [cfg, setCfg] = useState<EvoCfg>({ url_api: "", api_key: "", webhook_base_url: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: adminData } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      setIsAdmin(!!adminData);
      if (!adminData) { setLoading(false); return; }
      const { data } = await supabase.from("settings").select("value").eq("key", "evolution_api").maybeSingle();
      if (data?.value) {
        try {
          const v = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
          setCfg({ url_api: v.url_api ?? "", api_key: v.api_key ?? "", webhook_base_url: v.webhook_base_url ?? "" });
        } catch { /* ignore */ }
      }
      if (typeof window !== "undefined") {
        setCfg((c) => ({ ...c, webhook_base_url: c.webhook_base_url || window.location.origin }));
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    if (!cfg.url_api || !cfg.api_key) return toast.error("URL e API Key são obrigatórias");
    setSaving(true);
    const payload = { user_id: user.id, key: "evolution_api", value: JSON.stringify(cfg) };
    const { data: existing } = await supabase.from("settings").select("id").eq("key", "evolution_api").maybeSingle();
    const q = existing
      ? supabase.from("settings").update(payload).eq("id", existing.id)
      : supabase.from("settings").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Configurações globais salvas");
  };

  if (isAdmin === false) {
    return (
      <PageShell title="Acesso restrito" description="Área exclusiva de administradores." icon={<ShieldAlert className="h-6 w-6" />}>
        <Card><CardContent className="py-10 text-center text-muted-foreground">
          Você não tem permissão para acessar esta página.
          <div className="mt-4"><Button variant="outline" onClick={() => navigate({ to: "/dashboard" })}>Voltar ao Dashboard</Button></div>
        </CardContent></Card>
      </PageShell>
    );
  }

  return (
    <PageShell
      title="Configurações Globais"
      description="Credenciais globais da plataforma. Estas configurações são compartilhadas por todos os usuários."
      icon={<Settings className="h-6 w-6" />}
      status="ativo"
    >
      <Card className="border-primary/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/30">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <CardTitle>WhatsApp / Evolution API</CardTitle>
              <CardDescription>Configuração única — usada por todas as instâncias de todos os usuários.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>URL da API</Label>
                <Input placeholder="https://evo.exemplo.com" value={cfg.url_api}
                  onChange={(e) => setCfg({ ...cfg, url_api: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>API Key global</Label>
                <Input type="password" placeholder="••••••••" value={cfg.api_key}
                  onChange={(e) => setCfg({ ...cfg, api_key: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>URL base para webhooks</Label>
                <Input placeholder="https://seuapp.com" value={cfg.webhook_base_url}
                  onChange={(e) => setCfg({ ...cfg, webhook_base_url: e.target.value })} />
                <p className="text-xs text-muted-foreground">Cada instância recebe um webhook em <code>/api/public/evolution/&lt;instance&gt;</code>.</p>
              </div>
              <div className="flex justify-end pt-2">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Salvar configurações
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}