import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({ meta: [{ title: "Ferramentas — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Ferramentas"
      description="Ative ferramentas como OCR, transcrição de áudio, leitura de comprovantes e integrações externas."
      icon={<Wrench className="h-6 w-6" />}
    />
  );
}
