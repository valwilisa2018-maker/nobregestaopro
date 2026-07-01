import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/white-label")({
  head: () => ({ meta: [{ title: "White Label — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="White Label"
      description="Personalize marca, cores, domínio próprio e prepare a plataforma para revenda SaaS."
      icon={<Palette className="h-6 w-6" />}
    />
  );
}
