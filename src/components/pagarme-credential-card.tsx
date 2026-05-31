import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { KeyRound, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { getPagarmeKeyStatus, savePagarmeKey } from "@/lib/pagarme.functions";

const GREEN = "#16a34a";
const GREEN_DARK = "#15803d";
const GREEN_SOFT = "#dcfce7";
const GREEN_BORDER = "#86efac";

export function PagarmeCredentialCard() {
  const callStatus = useServerFn(getPagarmeKeyStatus);
  const callSave = useServerFn(savePagarmeKey);

  const [status, setStatus] = useState<{ configured: boolean; masked: string | null; source: "database" | "env" | null } | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const refreshStatus = async () => {
    try {
      const s = await callStatus({});
      setStatus({ configured: s.configured, masked: s.masked, source: s.source });
    } catch {
      setStatus({ configured: false, masked: null, source: null });
    }
  };

  useEffect(() => { refreshStatus(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const saveKey = async () => {
    if (apiKey.trim().length < 10) return toast.error("Chave inválida");
    setSavingKey(true);
    try {
      const res = await callSave({ data: { api_key: apiKey.trim() } });
      if (!res.ok) return toast.error(res.error);
      toast.success("Credencial salva com sucesso");
      setApiKey("");
      await refreshStatus();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao salvar credencial");
    } finally { setSavingKey(false); }
  };

  const greenCardStyle: React.CSSProperties = {
    background: "#ffffff",
    borderColor: GREEN_BORDER,
    color: "#0a0a0a",
    boxShadow: "0 8px 28px -12px rgba(22,163,74,0.35)",
  };
  const greenInputClass =
    "bg-white text-neutral-900 placeholder:text-neutral-400 border-emerald-300 " +
    "focus-visible:ring-emerald-500 focus-visible:border-emerald-500";

  return (
    <Card className="border-2" style={greenCardStyle}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2" style={{ color: GREEN_DARK }}>
          <KeyRound className="w-4 h-4" />
          Credencial Pagar.me
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className="flex items-start gap-2 p-3 rounded-lg"
          style={{ background: GREEN_SOFT, border: `1px solid ${GREEN_BORDER}` }}
        >
          {status?.configured ? (
            <>
              <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" style={{ color: GREEN_DARK }} />
              <div className="text-sm" style={{ color: GREEN_DARK }}>
                <div className="font-semibold">Credencial configurada</div>
                <div className="text-xs opacity-80">
                  Chave atual: <code className="bg-white/70 px-1 rounded">{status.masked}</code>
                  {status.source === "env" && " (variável de ambiente)"}
                </div>
              </div>
            </>
          ) : (
            <>
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0 text-amber-600" />
              <div className="text-sm text-amber-700">
                <div className="font-semibold">Nenhuma credencial configurada</div>
                <div className="text-xs">Cole abaixo a Secret Key (sk_…) da sua conta Pagar.me.</div>
              </div>
            </>
          )}
        </div>

        <div className="space-y-1">
          <Label style={{ color: GREEN_DARK }}>Secret Key (sk_…)</Label>
          <div className="flex gap-2">
            <Input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk_test_••••••••••••"
              className={greenInputClass}
              autoComplete="off"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowKey((s) => !s)}
              className="bg-white border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {showKey ? "Ocultar" : "Ver"}
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            A chave fica armazenada com segurança e nunca aparece em telas públicas.
          </p>
        </div>

        <Button
          onClick={saveKey}
          disabled={savingKey || !apiKey.trim()}
          className="text-white font-semibold"
          style={{ background: GREEN, borderColor: GREEN_DARK }}
        >
          {savingKey ? (<><Loader2 className="w-4 h-4 mr-2 animate-spin" />Salvando…</>) : "Salvar credencial"}
        </Button>
      </CardContent>
    </Card>
  );
}