import { createFileRoute } from "@tanstack/react-router";
import { AudioLines } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/audios")({
  head: () => ({ meta: [{ title: "Áudios — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="audio_messages"
      title="Áudios"
      description="Transcrição e histórico de áudios."
      singular="Áudio"
      icon={<AudioLines className="h-6 w-6" />}
      fields={[
        { name: "audio_url", label: "URL do áudio", type: "url" },
        {
          name: "direction",
          label: "Direção",
          type: "select",
          options: [
            { value: "inbound", label: "Recebido" },
            { value: "outbound", label: "Enviado" },
          ],
        },
        { name: "duration_seconds", label: "Duração (s)", type: "number" },
        { name: "transcription", label: "Transcrição", type: "textarea" },
        { name: "language", label: "Idioma", type: "text" },
      ]}
    />
  );
}
