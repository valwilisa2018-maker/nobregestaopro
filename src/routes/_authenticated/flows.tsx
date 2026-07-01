import { createFileRoute } from "@tanstack/react-router";
import { Workflow } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({ meta: [{ title: "Fluxos — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Fluxos"
      description="Desenhe fluxos de atendimento automatizados com gatilhos, condições e handoffs."
      icon={<Workflow className="h-6 w-6" />}
    />
  );
}
