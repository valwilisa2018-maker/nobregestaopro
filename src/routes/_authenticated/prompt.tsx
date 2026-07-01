import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/prompt")({
  head: () => ({ meta: [{ title: "Prompts — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="prompts"
      title="Prompts"
      description="Biblioteca de prompts reutilizáveis."
      singular="Prompt"
      icon={<Brain className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"content", label:"Conteúdo", type:"textarea", required:true},
    {name:"is_default", label:"Padrão", type:"boolean"}
      ]}
    />
  );
}
