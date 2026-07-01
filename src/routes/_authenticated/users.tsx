import { createFileRoute } from "@tanstack/react-router";
import { UserCog } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/users")({
  head: () => ({ meta: [{ title: "Usuários — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Usuários"
      description="Convide operadores, defina cargos e gerencie acesso à plataforma."
      icon={<UserCog className="h-6 w-6" />}
    />
  );
}
