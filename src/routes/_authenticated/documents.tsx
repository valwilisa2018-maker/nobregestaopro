import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { PageShell } from "@/components/page-shell";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documentos — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <PageShell
      title="Documentos"
      description="Gerencie arquivos enviados por clientes: comprovantes, contratos, imagens e áudios."
      icon={<FileText className="h-6 w-6" />}
    />
  );
}
