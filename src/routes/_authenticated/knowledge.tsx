import { createFileRoute } from "@tanstack/react-router";
import { BookOpen } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Base de Conhecimento — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="knowledge_documents"
      title="Base de Conhecimento"
      description="Alimenta os agentes com contexto."
      singular="Documento"
      icon={<BookOpen className="h-6 w-6" />}
      fields={[
    {name:"title", label:"Título", type:"text", required:true},
    {name:"source_type", label:"Tipo", type:"select", options:[{value:"text",label:"Texto"},{value:"pdf",label:"PDF"},{value:"url",label:"URL"}]},
    {name:"source_url", label:"URL", type:"url"},
    {name:"content", label:"Conteúdo", type:"textarea"}
      ]}
    />
  );
}
