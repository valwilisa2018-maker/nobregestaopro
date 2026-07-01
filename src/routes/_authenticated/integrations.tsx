import { createFileRoute } from "@tanstack/react-router";
import { Puzzle } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/integrations")({
  head: () => ({ meta: [{ title: "Integrações — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Integrações"
      description="Conectores prontos: CRMs, ERPs, Google Sheets, Zapier, n8n e mais."
      icon={<Puzzle className="h-6 w-6" />}
    />
  );
}
