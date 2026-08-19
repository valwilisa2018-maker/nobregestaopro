import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";
import { MasterGuard } from "@/components/master-guard";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Usuários — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <MasterGuard>
      <CrudResource
        table="profiles"
        title="Usuários"
        description="Perfis dos operadores."
        singular="Perfil"
        icon={<UserCog className="h-6 w-6" />}
        fields={[
          { name: "full_name", label: "Nome completo", type: "text" },
          { name: "phone", label: "Telefone", type: "text" },
          { name: "avatar_url", label: "Avatar URL", type: "url" },
        ]}
      />
    </MasterGuard>
  );
}
