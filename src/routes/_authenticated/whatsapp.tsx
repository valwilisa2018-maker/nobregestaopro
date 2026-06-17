import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, Smartphone, RefreshCw, LogOut, Trash2, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import {
  evolutionCreateInstance,
  evolutionGetQr,
  evolutionStatus,
  evolutionLogout,
  evolutionDelete,
  evolutionFetchInstance,
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

function extractNumber(resp: any): string | null {
  return (
    resp?.instance?.owner ??
    resp?.instance?.number ??
    resp?.owner ??
    resp?.number ??
    null
  );
}

function WhatsAppConnectPage() {
  const create = useServerFn(evolutionCreateInstance);
  const getQr = useServerFn(evolutionGetQr);
  const status = useServerFn(evolutionStatus);
  const logout = useServerFn(evolutionLogout);
  const deleteInstance = useServerFn(evolutionDelete);
  const fetchInstance = useServerFn(evolutionFetchInstance);

  const [instanceName, setInstanceName] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("evo_instance")) || "nobre-bot",
  );
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<string>("idle");
  const [loading, setLoading] = useState(false);
  const [number, setNumber] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
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

  const syncStatus = async (silent = true) => {
    try {
      const s = await status({ data: { instanceName: instanceName.trim() } });
      const st = extractState(s);
      setState(st);
      setLastCheck(new Date());
      if (st === "open" || st === "connected") {
        if (qr) {
          setQr(null);
          toast.success("WhatsApp conectado!");
        }
        // try to enrich with phone number
        try {
          const info = await fetchInstance({ data: { instanceName: instanceName.trim() } });
          setNumber(extractNumber(info));
        } catch {}
      } else {
        setNumber(null);
      }
      return st;
    } catch (e: any) {
      if (!silent) toast.error(e?.message ?? "Falha ao verificar status");
      setState("disconnected");
      setNumber(null);
      return "disconnected";
    }
  };

  const startPolling = (fast = false) => {
    stopPolling();
    pollRef.current = window.setInterval(() => {
      syncStatus(true);
    }, fast ? 3000 : 10000);
  };

  // Auto-sync on mount and whenever the instance name changes
  useEffect(() => {
    syncStatus(true);
    startPolling(false);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName]);

  const handleConnect = async () => {
    if (!instanceName.trim()) return toast.error("Informe o nome da instância");
    setLoading(true);
    setQr(null);
    try {
      // Check first — if already open on Evolution, just sync UI
      const current = await syncStatus(true);
      if (current === "open" || current === "connected") {
        toast.success("Já está conectado na Evolution.");
        startPolling(false);
        return;
      }
      const resp = await create({ data: { instanceName: instanceName.trim() } });
      let base64 = extractQrBase64(resp);
      if (!base64) {
        const qrResp = await getQr({ data: { instanceName: instanceName.trim() } });
        base64 = extractQrBase64(qrResp);
      }
      if (base64) {
        setQr(base64);
        setState("qrcode");
        startPolling(true);
      } else {
        await syncStatus(false);
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
        startPolling(true);
      } else toast.message("QR não disponível agora");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleCheck = async () => {
    setLoading(true);
    await syncStatus(false);
    setLoading(false);
    toast.success("Status atualizado");
  };

  const handleLogout = async () => {
    if (!confirm("Desconectar o número da Evolution?")) return;
    setLoading(true);
    try {
      await logout({ data: { instanceName: instanceName.trim() } });
      setQr(null);
      setState("disconnected");
      setNumber(null);
      await syncStatus(true);
      toast.success("Desconectado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Remover a instância da Evolution? Isso apaga a sessão completamente.")) return;
    setLoading(true);
    try {
      await deleteInstance({ data: { instanceName: instanceName.trim() } });
      setQr(null);
      setState("disconnected");
      setNumber(null);
      toast.success("Instância removida da Evolution");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro");
    } finally {
      setLoading(false);
    }
  };

  const isConnected = state === "open" || state === "connected";
  const stateColor = isConnected
    ? "default"
    : state === "qrcode" || state === "connecting"
    ? "secondary"
    : "outline";
  const StateIcon = isConnected
    ? CheckCircle2
    : state === "qrcode" || state === "connecting"
    ? AlertCircle
    : XCircle;

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
              {isConnected ? "Reconectar / Verificar" : "Ativar / Gerar QR"}
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
            <Button variant="outline" onClick={handleDelete} disabled={loading}>
              <Trash2 className="h-4 w-4 mr-2" /> Remover instância
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm pt-2 border-t">
            <div className="flex items-center gap-2">
              <StateIcon className="h-4 w-4" />
              <span className="text-muted-foreground">Status:</span>
              <Badge variant={stateColor as any}>{state}</Badge>
            </div>
            {number && (
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">Número:</span>
                <span className="font-mono">{number}</span>
              </div>
            )}
            {lastCheck && (
              <span className="text-xs text-muted-foreground ml-auto">
                Última verificação: {lastCheck.toLocaleTimeString()}
              </span>
            )}
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