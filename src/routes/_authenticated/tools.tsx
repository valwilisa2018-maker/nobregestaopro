import { createFileRoute } from "@tanstack/react-router";
import { Wrench } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/tools")({
  head: () => ({ meta: [{ title: "Ferramentas — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="tools"
      title="Ferramentas"
      description="OCR, transcrição e integrações."
      singular="Ferramenta"
      icon={<Wrench className="h-6 w-6" />}
      fields={[
        { name: "name", label: "Nome", type: "text", required: true },
        {
          name: "kind",
          label: "Tipo",
          type: "select",
          options: [
            { value: "ocr", label: "OCR" },
            { value: "transcription", label: "Transcrição" },
            { value: "receipt", label: "Comprovante" },
            { value: "http", label: "HTTP" },
            { value: "custom", label: "Custom" },
          ],
        },
        { name: "is_active", label: "Ativo", type: "boolean" },
      ]}
    />
  );
}
