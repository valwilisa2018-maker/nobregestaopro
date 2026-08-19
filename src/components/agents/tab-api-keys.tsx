import { useEffect, useState } from "react";
import { Save, Eye, EyeOff, Info, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Row = { provider: string; label: string; placeholder: string; dot: string };
const ROWS: Row[] = [
  { provider: "gemini", label: "Google Gemini", placeholder: "AIza...", dot: "bg-emerald-500" },
  { provider: "openai", label: "OpenAI (ChatGPT)", placeholder: "sk-...", dot: "bg-purple-500" },
  { provider: "deepseek", label: "DeepSeek", placeholder: "sk-...", dot: "bg-blue-500" },
  { provider: "grok", label: "xAI (Grok)", placeholder: "xai-...", dot: "bg-slate-500" },
  { provider: "elevenlabs", label: "ElevenLabs", placeholder: "sk_...", dot: "bg-pink-500" },
];

export function TabApiKeys() {
  const { user } = useAuth();
  const [values, setValues] = useState<Record<string, string>>({});
  const [show, setShow] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    if (!user) {
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("ai_providers")
      .select("provider,api_key")
      .eq("user_id", user.id);
    const map: Record<string, string> = {};
    (data ?? []).forEach((r: { provider: string; api_key: string | null }) => {
      if (r.api_key) map[r.provider] = r.api_key;
    });
    setValues(map);
    setLoading(false);
  }
  useEffect(() => {
    load(); /* eslint-disable-next-line */
  }, [user]);

  async function save() {
    if (!user) return;
    setSaving(true);
    try {
      for (const row of ROWS) {
        const v = values[row.provider]?.trim();
        if (!v) continue;
        const { data: existing } = await supabase
          .from("ai_providers")
          .select("id")
          .eq("provider", row.provider)
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle();
        if (existing?.id) {
          await supabase
            .from("ai_providers")
            .update({ api_key: v, is_active: true })
            .eq("id", existing.id)
            .eq("user_id", user.id);
        } else {
          await supabase.from("ai_providers").insert({
            user_id: user.id,
            name: row.label,
            provider: row.provider,
            api_key: v,
            is_active: true,
          });
        }
      }
      toast.success("Chaves salvas");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold">Chaves de API</h2>
        <p className="text-sm text-muted-foreground">
          Insira as chaves de API dos provedores que deseja utilizar.
        </p>
      </div>

      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 text-xs flex items-start gap-2 text-muted-foreground">
        <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
        Somente o provedor selecionado em cada agente será utilizado. Configure as chaves aqui e
        escolha o provedor na configuração de cada agente.
      </div>

      {loading ? (
        <div className="grid place-items-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-3">
          {ROWS.map((r) => (
            <div
              key={r.provider}
              className="rounded-2xl border border-border/60 bg-card/40 p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${r.dot}`} />
                <h3 className="font-semibold text-sm">{r.label}</h3>
              </div>
              <div className="flex gap-2">
                <Input
                  type={show[r.provider] ? "text" : "password"}
                  placeholder={r.placeholder}
                  value={values[r.provider] ?? ""}
                  onChange={(e) => setValues({ ...values, [r.provider]: e.target.value })}
                  className="font-mono text-sm bg-background/60"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShow({ ...show, [r.provider]: !show[r.provider] })}
                >
                  {show[r.provider] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}{" "}
                  Mostrar
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Button
        onClick={save}
        disabled={saving}
        className="rounded-xl"
        style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-elegant)" }}
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}{" "}
        Salvar Chaves
      </Button>
    </div>
  );
}
