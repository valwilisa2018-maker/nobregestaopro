import { createFileRoute } from "@tanstack/react-router";
import { MessagesSquare } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/conversations")({
  head: () => ({ meta: [{ title: "Conversas — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="conversations"
      title="Conversas"
      description="Caixa de entrada unificada."
      singular="Conversa"
      icon={<MessagesSquare className="h-6 w-6" />}
      fields={[
    {name:"status", label:"Status", type:"select", options:[{value:"open",label:"Aberta"},{value:"pending",label:"Pendente"},{value:"closed",label:"Encerrada"},{value:"archived",label:"Arquivada"}]},
    {name:"unread_count", label:"Não lidas", type:"number"}
      ]}
    />
  );
}
