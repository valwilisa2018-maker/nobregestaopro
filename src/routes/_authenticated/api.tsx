import { createFileRoute } from "@tanstack/react-router";
import { Code2 } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => ({ meta: [{ title: "API — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="api_keys"
      title="API"
      description="Chaves de API para integrações."
      singular="API Key"
      icon={<Code2 className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"key_prefix", label:"Prefixo", type:"text", required:true},
    {name:"key_hash", label:"Hash", type:"text", required:true}
      ]}
    />
  );
}
