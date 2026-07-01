import { createFileRoute } from "@tanstack/react-router";
import { Bot } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/agents")({
  head: () => ({ meta: [{ title: "Agentes — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Agentes"
      description="Configure múltiplos agentes de IA especializados por função, tom de voz e base de conhecimento."
      icon={<Bot className="h-6 w-6" />}
    />
  );
}
