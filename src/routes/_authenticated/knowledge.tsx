import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Base de Conhecimento — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Base de Conhecimento"
      description="Ingira PDFs, sites e textos para alimentar respostas contextualizadas dos agentes."
      icon={<BookOpen className="h-6 w-6" />}
    />
  );
}
