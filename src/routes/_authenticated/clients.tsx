import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/clients")({
  head: () => ({ meta: [{ title: "Clientes — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Clientes"
      description="CRM leve com histórico de conversas, tags, notas e status por cliente."
      icon={<Users className="h-6 w-6" />}
    />
  );
}
