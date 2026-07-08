import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";
import { MasterGuard } from "@/components/master-guard";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <MasterGuard>
    <CrudResource
      table="webhooks"
      title="Webhooks"
      description="Notificações de eventos."
      singular="Webhook"
      icon={<Webhook className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"url", label:"URL", type:"url", required:true},
    {name:"secret", label:"Secret", type:"password"},
    {name:"is_active", label:"Ativo", type:"boolean"}
      ]}
    />
    </MasterGuard>
  );
}
