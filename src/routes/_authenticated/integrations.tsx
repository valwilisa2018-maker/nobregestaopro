import { createFileRoute } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrações — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="integrations"
      title="Integrações"
      description="Conectores externos."
      singular="Integração"
      icon={<Puzzle className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"kind", label:"Tipo", type:"select", options:[{value:"zapier",label:"Zapier"},{value:"n8n",label:"n8n"},{value:"sheets",label:"Google Sheets"},{value:"crm",label:"CRM"},{value:"erp",label:"ERP"},{value:"custom",label:"Custom"}]},
    {name:"is_active", label:"Ativo", type:"boolean"}
      ]}
    />
  );
}
