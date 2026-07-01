import { createFileRoute } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  head: () => ({ meta: [{ title: "WhatsApp — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="WhatsApp"
      description="Painel operacional das instâncias Evolution API conectadas ao WhatsApp."
      icon={<MessageCircle className="h-6 w-6" />}
    />
  );
}
