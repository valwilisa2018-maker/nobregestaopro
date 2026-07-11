import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Mail, Send, Save, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import { getEmailSettings, saveEmailSettings, sendTestEmail, type EmailSettingsInput } from "@/lib/email-config.functions";

export const Route = createFileRoute("/master/email-config")({
  component: EmailConfigPage,
});

const DEFAULT: EmailSettingsInput = {
  sender_email: "",
  sender_name: "Agent IA",
  reply_to: "",
  signup_enabled: true,
  reset_enabled: true,
  signup_banner_url: "",
  reset_banner_url: "",
  signup_subject: "Bem-vindo(a) à Agent IA! 🎉",
  reset_subject: "Redefinição de senha — Agent IA",
  brand_color: "#d4af37",
};

function EmailConfigPage() {
  const [form, setForm] = useState<EmailSettingsInput>(DEFAULT);
  const [hasKey, setHasKey] = useState(false);
  const [keyStatus, setKeyStatus] = useState<"missing" | "smtp" | "valid" | "invalid">("missing");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testing, setTesting] = useState<"signup" | "reset" | null>(null);

  useEffect(() => {
    getEmailSettings().then((res) => {
      if (res.settings) setForm({ ...DEFAULT, ...res.settings });
      setHasKey(res.hasBrevoKey);
      setKeyStatus(res.brevoKeyStatus ?? (res.hasBrevoKey ? "valid" : "missing"));
    }).catch((e) => toast.error(e.message)).finally(() => setLoading(false));
  }, []);

  const update = <K extends keyof EmailSettingsInput>(k: K, v: EmailSettingsInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function onSave() {
    setSaving(true);
    try {
      await saveEmailSettings({ data: form });
      toast.success("Configurações salvas!");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function onTest(kind: "signup" | "reset") {
    if (!testTo) return toast.error("Informe um e-mail de destino para o teste.");
    setTesting(kind);
    try {
      await saveEmailSettings({ data: form });
      await sendTestEmail({ data: { to: testTo, kind } });
      toast.success(`E-mail de teste (${kind === "signup" ? "cadastro" : "reset"}) enviado!`);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setTesting(null);
    }
  }

  if (loading) return <div className="text-muted-foreground">Carregando…</div>;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 text-white">
          <Mail className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Configuração de E-mails</h1>
          <p className="text-sm text-muted-foreground">Envio via <strong>Brevo</strong> — cadastro e recuperação de senha</p>
        </div>
      </div>

      <Card className={hasKey ? "border-emerald-500/40" : "border-amber-500/60"}>
        <CardContent className="flex items-center gap-3 py-4">
          {hasKey ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div className="text-sm">Chave <code className="rounded bg-muted px-1.5 py-0.5">BREVO_API_KEY</code> configurada.</div>
              <Badge variant="outline" className="ml-auto border-emerald-500/40 text-emerald-500">Conectado</Badge>
            </>
          ) : (
            <>
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div className="text-sm">
                {keyStatus === "smtp"
                  ? "A chave salva é SMTP da Brevo (xsmtpsib-) e não serve para envio via API. Troque por uma API Key v3 que começa com xkeysib-."
                  : keyStatus === "invalid"
                    ? "A chave Brevo salva é inválida. Use uma API Key v3 que começa com xkeysib-."
                    : "Falta a chave da API Brevo (deve começar com xkeysib-). Configure em Secrets."}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Remetente</CardTitle>
          <CardDescription>O e-mail precisa estar verificado na Brevo (Senders & IPs).</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Nome do remetente</Label>
            <Input value={form.sender_name} onChange={(e) => update("sender_name", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>E-mail do remetente</Label>
            <Input type="email" placeholder="no-reply@seudominio.com" value={form.sender_email ?? ""} onChange={(e) => update("sender_email", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Reply-to (opcional)</Label>
            <Input type="email" placeholder="suporte@seudominio.com" value={form.reply_to ?? ""} onChange={(e) => update("reply_to", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Cor da marca</Label>
            <div className="flex items-center gap-2">
              <Input type="color" value={form.brand_color} onChange={(e) => update("brand_color", e.target.value)} className="w-16 h-10 p-1" />
              <Input value={form.brand_color} onChange={(e) => update("brand_color", e.target.value)} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>E-mail de Cadastro</CardTitle>
              <CardDescription>Enviado após o usuário criar a conta.</CardDescription>
            </div>
            <Switch checked={form.signup_enabled} onCheckedChange={(v) => update("signup_enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input value={form.signup_subject} onChange={(e) => update("signup_subject", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> URL do banner (opcional)</Label>
            <Input placeholder="https://.../banner-cadastro.png" value={form.signup_banner_url ?? ""} onChange={(e) => update("signup_banner_url", e.target.value)} />
            {form.signup_banner_url && <img src={form.signup_banner_url} alt="preview" className="mt-2 max-h-40 rounded border" />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>E-mail de Recuperação de Senha</CardTitle>
              <CardDescription>Enviado quando o usuário solicita reset de senha.</CardDescription>
            </div>
            <Switch checked={form.reset_enabled} onCheckedChange={(v) => update("reset_enabled", v)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Assunto</Label>
            <Input value={form.reset_subject} onChange={(e) => update("reset_subject", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" /> URL do banner (opcional)</Label>
            <Input placeholder="https://.../banner-reset.png" value={form.reset_banner_url ?? ""} onChange={(e) => update("reset_banner_url", e.target.value)} />
            {form.reset_banner_url && <img src={form.reset_banner_url} alt="preview" className="mt-2 max-h-40 rounded border" />}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Teste de envio</CardTitle>
          <CardDescription>Envie um e-mail de teste para conferir remetente e banner.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label>E-mail de destino</Label>
            <Input type="email" placeholder="voce@exemplo.com" value={testTo} onChange={(e) => setTestTo(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => onTest("signup")} disabled={testing !== null || !hasKey}>
              <Send className="h-4 w-4 mr-2" /> {testing === "signup" ? "Enviando…" : "Testar Cadastro"}
            </Button>
            <Button variant="outline" onClick={() => onTest("reset")} disabled={testing !== null || !hasKey}>
              <Send className="h-4 w-4 mr-2" /> {testing === "reset" ? "Enviando…" : "Testar Reset"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="sticky bottom-4 flex justify-end">
        <Button size="lg" onClick={onSave} disabled={saving} className="shadow-lg">
          <Save className="h-4 w-4 mr-2" /> {saving ? "Salvando…" : "Salvar configurações"}
        </Button>
      </div>
    </div>
  );
}
