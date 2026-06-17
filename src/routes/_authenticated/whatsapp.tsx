import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  LogOut,
  RefreshCw,
  Smartphone,
  Trash2,
  XCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { supabase } from "@/integrations/supabase/client";
import {
  evolutionCreateInstance,
  evolutionGetQr,
  evolutionStatus,
  evolutionLogout,
  evolutionDelete,
  evolutionFetchInstance,
} from "@/lib/evolution.functions";

type JsonRecord = { [key: string]: unknown };
type StatusVariant = "default" | "secondary" | "outline";

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" ? (value as JsonRecord) : {};
}

function nestedValue(value: unknown, path: string[]) {
  let current: unknown = value;
  for (const key of path) {
    current = asRecord(current)[key];
  }
  return current;
}

function nestedString(value: unknown, path: string[]) {
  const found = nestedValue(value, path);
  return typeof found === "string" ? found : null;
}

function findQrCandidate(value: unknown, depth = 0): string | null {
  if (!value || depth > 5) return null;
  if (typeof value === "string") return value.length > 50 ? value : null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findQrCandidate(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const record = asRecord(value);
  const priorityKeys = ["base64", "code", "qrcode", "qrCode", "qr_code", "qr"];
  for (const key of priorityKeys) {
    const found = findQrCandidate(record[key], depth + 1);
    if (found) return found;
  }
  for (const [key, item] of Object.entries(record)) {
    if (/qr|code|base64/i.test(key)) {
      const found = findQrCandidate(item, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppConnectPage,
  head: () => ({ meta: [{ title: "Conectar WhatsApp" }] }),
});

function extractQrBase64(resp: unknown): string | null {
  if (!resp) return null;
  const candidates = [
    nestedString(resp, ["base64"]),
    nestedString(resp, ["code"]),
    nestedString(resp, ["qrcode", "base64"]),
    nestedString(resp, ["qrcode", "code"]),
    nestedString(resp, ["qrcode"]),
    nestedString(resp, ["qr", "base64"]),
    nestedString(resp, ["qr", "code"]),
    nestedString(resp, ["data", "base64"]),
    nestedString(resp, ["data", "code"]),
    nestedString(resp, ["data", "qrcode", "base64"]),
    nestedString(resp, ["data", "qrcode", "code"]),
    nestedString(resp, ["data", "qrCode", "base64"]),
    nestedString(resp, ["data", "qrCode", "code"]),
    nestedString(resp, ["qrCode", "base64"]),
    nestedString(resp, ["qrCode", "code"]),
    nestedString(resp, ["qrCode"]),
    nestedString(resp, ["instance", "qrcode", "base64"]),
    findQrCandidate(resp),
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.length > 50) {
      if (c.startsWith("data:image")) return c;
      if (c.startsWith("iVBOR") || c.startsWith("/9j/") || c.startsWith("R0lGOD")) {
        return `data:image/png;base64,${c}`;
      }
      return c;
    }
  }
  return null;
}

function extractState(resp: unknown): string {
  return (
    nestedString(resp, ["instance", "state"]) ??
    nestedString(resp, ["state"]) ??
    nestedString(resp, ["status"]) ??
    "unknown"
  );
}

function extractNumber(resp: unknown): string | null {
  return (
    nestedString(resp, ["instance", "owner"]) ??
    nestedString(resp, ["instance", "number"]) ??
    nestedString(resp, ["owner"]) ??
    nestedString(resp, ["number"]) ??
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
        } catch {
          // Número é opcional; status continua válido sem ele.
        }
      } else {
        setNumber(null);
      }
      return st;
    } catch (e: unknown) {
      if (!silent) toast.error(getErrorMessage(e) || "Falha ao verificar status");
      setState((prev) => (prev === "qrcode" || prev === "connecting" ? prev : "unreachable"));
      setNumber(null);
      return "unreachable";
    }
  };

  const startPolling = (fast = false) => {
    stopPolling();
    pollRef.current = window.setInterval(
      () => {
        syncStatus(true);
      },
      fast ? 3000 : 10000,
    );
  };

  // Auto-sync on mount and whenever the instance name changes
  useEffect(() => {
    syncStatus(true);
    startPolling(false);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName]);

  // Realtime: react instantly to webhook-driven status updates
  useEffect(() => {
    const name = instanceName.trim();
    if (!name) return;
    const channel = supabase
      .channel(`whatsapp_status:${name}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "whatsapp_status",
          filter: `instance_name=eq.${name}`,
        },
        (payload) => {
          const row = asRecord(payload.new ?? payload.old);
          if (!row) return;
          const st = String(row.state ?? "unknown");
          setState(st);
          setLastCheck(new Date());
          if (typeof row.number === "string") setNumber(row.number);
          if (st === "open" || st === "connected") {
            if (qr) {
              setQr(null);
              toast.success("WhatsApp conectado!");
            }
          } else if (st === "close" || st === "disconnected") {
            setNumber(null);
            toast.warning("WhatsApp desconectou");
          }
          // Re-confirm with Evolution to make sure we mirror the real state
          syncStatus(true);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instanceName]);

  const handleConnect = async () => {
    if (!instanceName.trim()) return toast.error("Informe o nome da instância");
    stopPolling();
    setLoading(true);
    setQr(null);
    setState("connecting");
    try {
      // Check first — if already open on Evolution, just sync UI
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
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Falha ao conectar");
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshQr = async () => {
    stopPolling();
    setLoading(true);
    setState("connecting");
    try {
      const qrResp = await getQr({ data: { instanceName: instanceName.trim() } });
      const b64 = extractQrBase64(qrResp);
      if (b64) {
        setQr(b64);
        startPolling(true);
      } else toast.message("QR não disponível agora");
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Erro");
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
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Erro");
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
    } catch (e: unknown) {
      toast.error(getErrorMessage(e) || "Erro");
    } finally {
      setLoading(false);
    }
  };

  const isConnected = state === "open" || state === "connected";
  const stateColor: StatusVariant = isConnected
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
          Conecte um número via Evolution API. Escaneie o QR Code com o WhatsApp do celular que vai
          ser o número-robô.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Instância</CardTitle>
          <CardDescription>
            Nome da instância na Evolution API. Use algo simples como <code>nobre-bot</code>.
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
              <Badge variant={stateColor}>{state}</Badge>
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
              No celular: WhatsApp → Configurações → Aparelhos conectados → Conectar um aparelho. O
              status atualiza sozinho ao conectar.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-center">
            {qr.startsWith("data:image") ? (
              <img
                src={qr}
                alt="QR Code WhatsApp"
                className="w-72 h-72 border rounded-lg bg-white p-2"
              />
            ) : (
              <div className="w-72 h-72 border rounded-lg bg-white p-4 flex items-center justify-center">
                <QRCodeSVG value={qr} size={248} level="M" includeMargin />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
