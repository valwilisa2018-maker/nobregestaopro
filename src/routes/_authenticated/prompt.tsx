import { createFileRoute } from "@tanstack/react-router";
import { Brain } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/prompt")({
  head: () => ({ meta: [{ title: "Prompt Master — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Prompt Master"
      description="Editor central do prompt de sistema, personalidade e regras de negócio dos agentes."
      icon={<Brain className="h-6 w-6" />}
    />
  );
}
