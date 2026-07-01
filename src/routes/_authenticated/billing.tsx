import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Financeiro — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Financeiro"
      description="Consumo de mensagens, tokens de IA, plano atual e histórico de faturas."
      icon={<DollarSign className="h-6 w-6" />}
    />
  );
}
