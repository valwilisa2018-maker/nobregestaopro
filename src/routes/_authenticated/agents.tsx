import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agentes — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="agents"
      title="Agentes"
      description="Configure múltiplos agentes de IA especializados."
      singular="Agente"
      icon={<Bot className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"description", label:"Descrição", type:"textarea"},
    {name:"role", label:"Função", type:"text"},
    {name:"system_prompt", label:"Prompt do sistema", type:"textarea"},
    {name:"temperature", label:"Temperatura", type:"number"},
    {name:"is_active", label:"Ativo", type:"boolean"}
      ]}
    />
  );
}
