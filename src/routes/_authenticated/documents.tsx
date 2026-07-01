import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/documents")({
  head: () => ({ meta: [{ title: "Documentos — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="documents"
      title="Documentos"
      description="Arquivos enviados pelos clientes."
      singular="Documento"
      icon={<FileText className="h-6 w-6" />}
      fields={[
    {name:"file_name", label:"Arquivo", type:"text", required:true},
    {name:"kind", label:"Tipo", type:"select", options:[{value:"file",label:"Arquivo"},{value:"receipt",label:"Comprovante"},{value:"invoice",label:"Fatura"},{value:"contract",label:"Contrato"}]},
    {name:"file_url", label:"URL", type:"url"},
    {name:"mime_type", label:"MIME", type:"text"},
    {name:"extracted_text", label:"Texto extraído", type:"textarea"}
      ]}
    />
  );
}
