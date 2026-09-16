import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import {
  whatsappGetSettings,
  whatsappSaveSettings,
  whatsappSendTest,
  whatsappTestConnection,
  whatsappTestWebhook,
} from "@/lib/whatsapp.functions";
import { CheckCircle2, Loader2, Plug, Send, Webhook, XCircle } from "lucide-react";

type Settings = Awaited<ReturnType<typeof whatsappGetSettings>>;

export function EvolutionSettingsCard() {
  const load = useServerFn(whatsappGetSettings);
  const save = useServerFn(whatsappSaveSettings);
  const test = useServerFn(whatsappTestConnection);
  const testWebhook = useServerFn(whatsappTestWebhook);
  const sendTest = useServerFn(whatsappSendTest);

  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [integrationName, setIntegrationName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testMessage, setTestMessage] = useState("Mensagem de teste da plataforma. ✅");

  const refresh = async () => {
    try {
      const data = await load();
      setSettings(data);
      setApiUrl(data.apiUrl ?? "");
      setIntegrationName(data.integrationName ?? "");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar as configurações."));
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async () => {
    setBusy("save");
    try {
      await save({ data: { apiUrl, apiKey, integrationName } });
      setApiKey("");
      toast.success("Configuração salva.");
      await refresh();
      await handleTest();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar."));
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBusy("test");
    try {
      const result = await test();
      if (result.status === "connected") toast.success("API conectada.");
      else toast.error(result.message);
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Falha ao testar."));
    } finally {
      setBusy(null);
    }
  };

  const handleWebhook = async () => {
    setBusy("webhook");
    try {
      const result = await testWebhook();
      if (result.ok) toast.success(result.message);
      else toast.error(result.message);
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Falha ao testar o webhook."));
    } finally {
      setBusy(null);
    }
  };

  const handleSendTest = async () => {
    setBusy("send");
    try {
      const result = await sendTest({ data: { phone: testPhone, message: testMessage } });
      if (result.ok) toast.success("Mensagem enviada.");
      else toast.error(`Falha no envio. ${result.message}`);
    } catch (e) {
      toast.error(getErrorMessage(e, "Falha no envio."));
    } finally {
      setBusy(null);
    }
  };

  const connectionBadge = () => {
    if (!settings) return null;
    if (!settings.configured)
      return (
        <Badge variant="outline" className="gap-1">
          <XCircle className="h-3.5 w-3.5" /> Não configurado
        </Badge>
      );
    if (settings.lastTestOk)
      return (
        <Badge className="gap-1 bg-emerald-600 hover:bg-emerald-600">
          <CheckCircle2 className="h-3.5 w-3.5" /> API conectada
        </Badge>
      );
    if (settings.lastTestOk === false)
      return (
        <Badge variant="destructive" className="gap-1">
          <XCircle className="h-3.5 w-3.5" /> {settings.lastTestMessage ?? "Sem conexão"}
        </Badge>
      );
    return <Badge variant="secondary">Aguardando teste</Badge>;
  };

  const webhookBadge = () => {
    if (!settings) return null;
    if (!settings.configured) return <Badge variant="outline">❌ Webhook não configurado</Badge>;
    if ((settings.webhookEventCount ?? 0) > 0)
      return (
        <Badge className="bg-emerald-600 hover:bg-emerald-600">✅ Recebendo eventos</Badge>
      );
    return <Badge variant="secondary">⚠️ Configurado, porém nenhum evento recebido</Badge>;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Plug className="h-5 w-5 text-primary" /> WhatsApp / Evolution API
              </CardTitle>
              <CardDescription>
                Conecte sua Evolution API para que a plataforma possa integrar seus números de
                WhatsApp, enviar mensagens e executar follow-ups automáticos.
              </CardDescription>
            </div>
            {connectionBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="evo-url">URL da Evolution API</Label>
              <Input
                id="evo-url"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://sua-evolution.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="evo-key">API Key / Token</Label>
              <Input
                id="evo-key"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={settings?.apiKeyMasked ?? "Cole sua API Key"}
              />
              {settings?.apiKeyMasked && (
                <p className="text-xs text-muted-foreground">
                  Salva atualmente: {settings.apiKeyMasked}
                </p>
              )}
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="evo-name">Nome da integração</Label>
              <Input
                id="evo-name"
                value={integrationName}
                onChange={(e) => setIntegrationName(e.target.value)}
                placeholder="Ex.: Evolution Nobre"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSave} disabled={busy !== null}>
              {busy === "save" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar configuração
            </Button>
            <Button variant="outline" onClick={handleTest} disabled={busy !== null}>
              {busy === "test" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Testar conexão
            </Button>
          </div>
          <Separator />
          <div className="rounded-lg bg-muted/40 p-4 text-sm">
            <p className="mb-2 font-medium">Como conectar</p>
            <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
              <li>Informe a URL da Evolution API.</li>
              <li>Informe sua API Key.</li>
              <li>Clique em Testar conexão.</li>
              <li>Salve.</li>
              <li>Vá para Conectar WhatsApp.</li>
              <li>Crie uma conexão e leia o QR Code.</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-primary" /> Webhook Evolution API
              </CardTitle>
              <CardDescription>
                Endereço que recebe automaticamente os avisos da Evolution API.
              </CardDescription>
            </div>
            {webhookBadge()}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="break-all rounded-md bg-muted/40 p-3 font-mono text-xs">
            {settings?.webhookUrl ?? "—"}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div>
              <p className="text-muted-foreground">Último evento</p>
              <p className="font-medium">{settings?.lastEvent?.event_type ?? "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Data/hora</p>
              <p className="font-medium">
                {settings?.lastEvent?.created_at
                  ? new Date(settings.lastEvent.created_at).toLocaleString("pt-BR")
                  : "—"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Conexão</p>
              <p className="font-medium">{settings?.lastEvent?.instance_name ?? "—"}</p>
            </div>
          </div>
          <Button variant="outline" onClick={handleWebhook} disabled={busy !== null}>
            {busy === "webhook" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Testar webhook
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" /> Enviar mensagem de teste
          </CardTitle>
          <CardDescription>Usa o primeiro WhatsApp conectado da plataforma.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="test-phone">Número (com DDD)</Label>
              <Input
                id="test-phone"
                value={testPhone}
                onChange={(e) => setTestPhone(e.target.value)}
                placeholder="(16) 99999-1111"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="test-message">Mensagem</Label>
              <Textarea
                id="test-message"
                value={testMessage}
                onChange={(e) => setTestMessage(e.target.value)}
                rows={2}
              />
            </div>
          </div>
          <Button onClick={handleSendTest} disabled={busy !== null || !testPhone}>
            {busy === "send" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar teste
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
