import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="logs"
      title="Logs"
      description="Logs técnicos da plataforma."
      singular="Log"
      icon={<ScrollText className="h-6 w-6" />}
      fields={[
    {name:"level", label:"Nível", type:"select", options:[{value:"info",label:"Info"},{value:"warn",label:"Warn"},{value:"error",label:"Error"},{value:"debug",label:"Debug"}]},
    {name:"source", label:"Origem", type:"text"},
    {name:"message", label:"Mensagem", type:"textarea", required:true}
      ]}
    />
  );
}
