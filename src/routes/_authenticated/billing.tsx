import { createFileRoute } from "@tanstack/react-router";
import { DollarSign } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({ meta: [{ title: "Financeiro — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="billing_events"
      title="Financeiro"
      description="Consumo e cobrança."
      singular="Evento"
      icon={<DollarSign className="h-6 w-6" />}
      fields={[
    {name:"kind", label:"Tipo", type:"select", options:[{value:"messages",label:"Mensagens"},{value:"tokens",label:"Tokens"},{value:"invoice",label:"Fatura"}]},
    {name:"description", label:"Descrição", type:"text"},
    {name:"quantity", label:"Quantidade", type:"number"},
    {name:"amount", label:"Valor", type:"number"},
    {name:"currency", label:"Moeda", type:"text"}
      ]}
    />
  );
}
