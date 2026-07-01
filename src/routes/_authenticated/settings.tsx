import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="settings"
      title="Configurações"
      description="Preferências chave/valor."
      singular="Configuração"
      icon={<Settings className="h-6 w-6" />}
      fields={[
    {name:"key", label:"Chave", type:"text", required:true},
    {name:"value", label:"Valor (JSON)", type:"textarea"}
      ]}
    />
  );
}
