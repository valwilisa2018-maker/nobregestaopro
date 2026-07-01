import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/permissions")({
  head: () => ({ meta: [{ title: "Permissões — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Permissões"
      description="Controle granular por papel: admin, supervisor, atendente e visualizador."
      icon={<ShieldCheck className="h-6 w-6" />}
    />
  );
}
