import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({ meta: [{ title: "Fluxos — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="flows"
      title="Fluxos"
      description="Automatize atendimentos com regras."
      singular="Fluxo"
      icon={<Workflow className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"description", label:"Descrição", type:"textarea"},
    {name:"trigger", label:"Gatilho", type:"text"},
    {name:"is_active", label:"Ativo", type:"boolean"}
      ]}
    />
  );
}
