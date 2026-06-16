import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Smartphone, RefreshCw, LogOut } from "lucide-react";
import {
  evolutionCreateInstance,
  evolutionGetQr,
  evolutionStatus,
  evolutionLogout,
} from "@/lib/evolution.functions";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppConnectPage,
  head: () => ({ meta: [{ title: "Conectar WhatsApp" }] }),
});

function extractQrBase64(resp: any): string | null {
  if (!resp) return null;
  const candidates = [
    resp?.base64,
    resp?.qrcode?.base64,
    resp?.qrcode,
    resp?.qr?.base64,
    resp?.instance?.qrcode?.base64,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 50) {
      return c.startsWith("data:") ? c : `data:image/png;base64,${c}`;
    }
  }
  return null;
}

function extractState(resp: any): string {
  return (
    resp?.instance?.state ??
    resp?.state ??
    resp?.status ??
    "unknown"
  );
}

function WhatsAppConnectPage() {
  const create = useServerFn(evolutionCreateInstance);
  const getQr = useServerFn(evolutionGetQr);
  const status = useServerFn(evolutionStatus);
  const logout = useServerFn(evolutionLogout);

  const [instanceName, setInstanceName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("evo_instance")) || "nobre-bot",
  );
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<string>("idle");
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("evo_instance", instanceName);
    }
  }, [instanceName]);

  const stopPolling = () => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const startPolling = () => {
    stopPolling();
    pollRef.current = window.setInterval(async () => {
      try {
        const s = await status({ data: { instanceName } });
        const st = extractState(s);
        setState(st);
        if (st === "open" || st === "connected") {
          setQr(null);
          stopPolling();
          toast.success("WhatsApp conectado com sucesso!");
        }
      } catch (e) {
        // ignore transient
      }
    }, 3000);
  };

  useEffect(() => stopPolling, []);

  const handleConnect = async () => {
    if (!instanceName.trim()) return toast.error("Informe o nome da instância");
    setLoading(true);
    setQr(null);
    try {
      const resp = await create({ data: { instanceName: instanceName.trim() } });
      let base64 = extractQrBase64(resp);
      if (!base64) {
        const qrResp = await getQr({ data: { instanceName: instanceName.trim() } });
        base64 = extractQrBase64(qrResp);
      }
      if (base64) {
        setQr(base64);
        setState("qrcode");
        startPolling();
      } else {
        const s = await status({ data: { instanceName: instanceName.trim() } });
        setState(extractState(s));
        toast.message("Não retornou QR — verifique o status.");
      }
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao conectar");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshQr = async () => {
    setLoading(true);
    try {
      const qrResp = await getQr({ data: { instanceName: instanceName.trim() } });
      const b64 = extractQrBase64(qrResp);
      if (b64) {
        setQr(b64);
        startPolling();
      } else toast.message("QR não disponível agora");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    setLoading(true);
    try {
      const s = await status({ data: { instanceName: instanceName.trim() } });
      setState(extractState(s));
      toast.success("Status atualizado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (!confirm("Desconectar o número?")) return;
    setLoading(true);
    try {
      await logout({ data: { instanceName: instanceName.trim() } });
      setQr(null);
      setState("disconnected");
      stopPolling();
      toast.success("Desconectado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const stateColor =
    state === "open" || state === "connected"
      ? "default"
      : state === "qrcode"
      ? "secondary"
      : "outline";

  return (
    <div className="container mx-auto max-w-3xl py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Smartphone className="h-7 w-7" /> Conectar WhatsApp
        </h1>
        <p className="text-muted-foreground mt-1">
          Conecte um número via Evolution API. Escaneie o QR Code com o WhatsApp
          do celular que vai ser o número-robô.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instância</CardTitle>
          <CardDescription>
            Nome da instância na Evolution API. Use algo simples como{" "}
            <code>nobre-bot</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inst">Nome da instância</Label>
            <Input
              id="inst"
              value={instanceName}
              onChange={(e) => setInstanceName(e.target.value)}
              placeholder="nobre-bot"
              disabled={loading}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={handleConnect} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Smartphone className="h-4 w-4 mr-2" />
              )}
              Gerar QR Code
            </Button>
            <Button variant="outline" onClick={handleCheck} disabled={loading}>
              <RefreshCw className="h-4 w-4 mr-2" /> Verificar status
            </Button>
            <Button variant="outline" onClick={handleRefreshQr} disabled={loading}>
              Atualizar QR
            </Button>
            <Button variant="destructive" onClick={handleLogout} disabled={loading}>
              <LogOut className="h-4 w-4 mr-2" /> Desconectar
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Status:</span>
            <Badge variant={stateColor as any}>{state}</Badge>
          </div>
        </CardContent>
      </Card>

      {qr && (
        <Card>
          <CardHeader>
            <CardTitle>Escaneie o QR Code</CardTitle>
            <CardDescription>
              No celular: WhatsApp → Configurações → Aparelhos conectados →
              Conectar um aparelho. O status atualiza sozinho ao conectar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            <img
              src={qr}
              alt="QR Code WhatsApp"
              className="w-72 h-72 border rounded-lg bg-white p-2"
            />
          </CardContent>
        </Card>
      )}
    </div>
  );
}