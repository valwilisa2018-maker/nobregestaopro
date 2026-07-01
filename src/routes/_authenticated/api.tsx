import { createFileRoute } from "@tanstack/react-router";
import { Code2 } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => ({ meta: [{ title: "API — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="API"
      description="Gere API keys, consulte endpoints e integre a plataforma a sistemas externos."
      icon={<Code2 className="h-6 w-6" />}
    />
  );
}
