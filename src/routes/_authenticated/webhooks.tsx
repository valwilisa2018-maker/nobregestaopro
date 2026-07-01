import { createFileRoute } from "@tanstack/react-router";
import { Webhook } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/webhooks")({
  head: () => ({ meta: [{ title: "Webhooks — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Webhooks"
      description="Configure webhooks de entrada e saída para eventos de conversas, mensagens e clientes."
      icon={<Webhook className="h-6 w-6" />}
    />
  );
}
