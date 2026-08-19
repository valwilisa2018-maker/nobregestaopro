import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clientes — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="clients"
      title="Clientes"
      description="CRM leve com histórico por contato."
      singular="Cliente"
      icon={<Users className="h-6 w-6" />}
      fields={[
        { name: "name", label: "Nome", type: "text" },
        { name: "phone", label: "Telefone", type: "text", required: true },
        { name: "email", label: "E-mail", type: "email" },
        { name: "notes", label: "Notas", type: "textarea" },
      ]}
    />
  );
}
