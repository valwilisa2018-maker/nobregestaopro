import { createFileRoute } from "@tanstack/react-router";
import { Brain, Sparkles, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { CrudResource } from "@/components/crud-resource";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { MASTER_PROMPT_CONTENT, MASTER_PROMPT_NAME } from "@/lib/master-prompt";

export const Route = createFileRoute("/_authenticated/prompt")({
  head: () => ({ meta: [{ title: "Prompts — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);

  async function insertMaster() {
    if (!user) return;
    setBusy(true);
    const { data: existing } = await supabase
      .from("prompts")
      .select("id")
      .eq("user_id", user.id)
      .eq("name", MASTER_PROMPT_NAME)
      .maybeSingle();
    if (existing?.id) {
      setBusy(false);
      toast.info("Prompt Mestre já existe na sua biblioteca.");
      return;
    }
    const { error } = await supabase.from("prompts").insert({
      user_id: user.id,
      name: MASTER_PROMPT_NAME,
      content: MASTER_PROMPT_CONTENT,
      is_default: false,
    } as never);
    setBusy(false);
    if (error) { toast.error("Falha ao adicionar Prompt Mestre"); return; }
    toast.success("Prompt Mestre adicionado — recarregue a lista.");
    window.location.reload();
  }

  return (
    <div className="relative">
      <div className="absolute right-6 top-6 z-10">
        <Button onClick={insertMaster} disabled={busy} variant="outline" className="gap-2">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Adicionar Prompt Mestre
        </Button>
      </div>
      <CrudResource
        table="prompts"
        title="Prompts"
        description="Biblioteca de prompts reutilizáveis."
        singular="Prompt"
        icon={<Brain className="h-6 w-6" />}
        fields={[
          { name: "name", label: "Nome", type: "text", required: true },
          { name: "content", label: "Conteúdo", type: "textarea", required: true },
          { name: "is_default", label: "Padrão", type: "boolean" },
        ]}
      />
    </div>
  );
}
