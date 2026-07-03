import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";
import { AdminGuard } from "@/components/admin-guard";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Permissões — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <AdminGuard>
    <CrudResource
      table="user_roles"
      title="Permissões"
      description="Papéis por usuário."
      singular="Permissão"
      icon={<ShieldCheck className="h-6 w-6" />}
      fields={[
    {name:"role", label:"Papel", type:"select", required:true, options:[{value:"admin",label:"Admin"},{value:"supervisor",label:"Supervisor"},{value:"atendente",label:"Atendente"},{value:"viewer",label:"Viewer"}]}
      ]}
    />
    </AdminGuard>
  );
}
