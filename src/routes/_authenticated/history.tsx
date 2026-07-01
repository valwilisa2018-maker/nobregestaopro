import { createFileRoute } from "@tanstack/react-router";
import { History } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="messages"
      title="Histórico"
      description="Todas as mensagens registradas."
      singular="Mensagem"
      icon={<History className="h-6 w-6" />}
      fields={[
    {name:"direction", label:"Direção", type:"select", options:[{value:"inbound",label:"Recebida"},{value:"outbound",label:"Enviada"}]},
    {name:"type", label:"Tipo", type:"select", options:[{value:"text",label:"Texto"},{value:"image",label:"Imagem"},{value:"audio",label:"Áudio"},{value:"video",label:"Vídeo"},{value:"document",label:"Documento"}]},
    {name:"content", label:"Conteúdo", type:"textarea"}
      ]}
    />
  );
}
