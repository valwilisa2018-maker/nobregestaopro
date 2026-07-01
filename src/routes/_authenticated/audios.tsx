import { createFileRoute } from "@tanstack/react-router";
import { AudioLines } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/audios")({
  head: () => ({ meta: [{ title: "Áudios — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Áudios"
      description="Transcrição automática, síntese de voz e histórico de mensagens de áudio."
      icon={<AudioLines className="h-6 w-6" />}
    />
  );
}
