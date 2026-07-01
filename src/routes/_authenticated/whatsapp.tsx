import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="connections"
      title="WhatsApp"
      description="Instâncias Evolution API conectadas."
      singular="Número"
      icon={<MessageCircle className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"instance_name", label:"Instance name", type:"text", required:true},
    {name:"url_api", label:"URL API", type:"url", required:true},
    {name:"api_key", label:"API Key", type:"password", required:true},
    {name:"phone_number", label:"Telefone", type:"text"}
      ]}
    />
  );
}
