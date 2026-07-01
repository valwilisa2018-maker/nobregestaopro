import { createFileRoute } from "@tanstack/react-router";
import { ScrollText } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Logs"
      description="Logs técnicos da plataforma, webhooks recebidos e execuções de agentes."
      icon={<ScrollText className="h-6 w-6" />}
    />
  );
}
