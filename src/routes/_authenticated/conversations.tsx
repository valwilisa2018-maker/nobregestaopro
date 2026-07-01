import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversas — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Conversas"
      description="Inbox unificada em tempo real de todas as conversas ativas."
      icon={<MessagesSquare className="h-6 w-6" />}
    />
  );
}
