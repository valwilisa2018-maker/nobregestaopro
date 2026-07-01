import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/ai")({
  head: () => ({ meta: [{ title: "Provedores de IA — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="ai_providers"
      title="Provedores de IA"
      description="Conecte OpenAI, Gemini e outros."
      singular="Provedor"
      icon={<Sparkles className="h-6 w-6" />}
      fields={[
    {name:"name", label:"Nome", type:"text", required:true},
    {name:"provider", label:"Provedor", type:"select", options:[{value:"openai",label:"OpenAI"},{value:"gemini",label:"Google Gemini"},{value:"anthropic",label:"Anthropic"},{value:"lovable",label:"Lovable AI"}]},
    {name:"model", label:"Modelo", type:"text"},
    {name:"api_key", label:"API Key", type:"password"},
    {name:"base_url", label:"Base URL", type:"url"},
    {name:"is_active", label:"Ativo", type:"boolean"}
      ]}
    />
  );
}
