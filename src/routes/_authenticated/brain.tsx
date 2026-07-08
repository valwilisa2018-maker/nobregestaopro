import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Brain, Loader2, RotateCcw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { AdminGuard } from "@/components/admin-guard";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/brain")({
  head: () => ({ meta: [{ title: "Cérebro Universal — Admin" }] }),
  component: () => <AdminGuard><Page /></AdminGuard>,
});

const DEFAULT_NEURAL_CORE = `# NEURAL CORE AI™ — CÉREBRO UNIVERSAL PREMIUM
Você é o núcleo de inteligência que controla o comportamento deste agente. Pense antes de falar. Toda resposta passa por um processo interno de análise.

## PROCESSO DE RACIOCÍNIO (interno, silencioso)
1) Entenda o que o usuário deseja. 2) Descubra a intenção principal. 3) Identifique intenções secundárias. 4) Analise o contexto completo. 5) Analise o histórico. 6) Analise memórias. 7) Identifique perfil. 8) Identifique nível de conhecimento. 9) Identifique emoções. 10) Verifique urgência. 11) Consulte a Base de Conhecimento quando necessário. 12) Verifique ferramentas. 13) Planeje a resposta. 14) Revise mentalmente. 15) Então responda.

## HUMANIZAÇÃO
Converse com naturalidade. Nunca soe robótico. Linguagem leve, elegante, educada, empática.

## BASE DE CONHECIMENTO
Sempre consulte antes de responder. Nunca invente. Priorize documentos oficiais. Em conflito, use o mais atual.

## SEGURANÇA
Nunca invente dados. Quando não souber, informe com clareza. Seja transparente.

## OBJETIVO
Faça a pessoa sentir que conversa com um especialista humano, atencioso e experiente.`;

function Page() {
  const [value, setValue] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("internal_config").select("value").eq("key", "neural_core").maybeSingle();
    setLoading(false);
    if (error) return toast.error(error.message);
    setValue(data?.value ?? DEFAULT_NEURAL_CORE);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!value.trim()) return toast.error("Prompt vazio");
    setSaving(true);
    const { error } = await supabase
      .from("internal_config")
      .upsert({ key: "neural_core", value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Cérebro atualizado — aplicado a todos os agentes");
  };

  const reset = () => {
    if (!confirm("Restaurar cérebro padrão?")) return;
    setValue(DEFAULT_NEURAL_CORE);
  };

  return (
    <PageShell
      title="Cérebro Universal"
      description="Prompt-núcleo aplicado automaticamente a TODOS os agentes antes do prompt específico e da Base de Conhecimento."
      icon={<Brain className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={loading || saving}>
            <RotateCcw className="h-4 w-4" /> Padrão
          </Button>
          <Button onClick={save} disabled={loading || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Salvar e aplicar
          </Button>
        </div>
      }
    >
      <Card>
        <CardContent className="p-4 space-y-3">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Suporta Markdown</span>
                <span>{value.length.toLocaleString("pt-BR")} chars · ~{Math.ceil(value.length / 4).toLocaleString("pt-BR")} tokens</span>
              </div>
              <Textarea
                value={value}
                onChange={(e) => setValue(e.target.value)}
                rows={28}
                className="font-mono text-sm leading-relaxed"
              />
            </>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}