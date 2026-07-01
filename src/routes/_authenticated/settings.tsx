import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Configurações — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Configurações"
      description="Preferências gerais da conta, fuso horário, idioma e comportamento padrão."
      icon={<Settings className="h-6 w-6" />}
    />
  );
}
