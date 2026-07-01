import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "Provedores de IA — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Provedores de IA"
      description="Conecte OpenAI, Google Gemini e outros provedores. Gerencie modelos, tokens e custos."
      icon={<Sparkles className="h-6 w-6" />}
    />
  );
}
