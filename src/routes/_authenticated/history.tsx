import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Histórico"
      description="Consulte conversas encerradas, exporte transcrições e audite atendimentos."
      icon={<History className="h-6 w-6" />}
    />
  );
}
