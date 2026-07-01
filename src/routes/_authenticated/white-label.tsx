import { createFileRoute } from "@tanstack/react-router";
import { Palette } from "lucide-react";
import { CrudResource } from "@/components/crud-resource";

export const Route = createFileRoute("/_authenticated/white-label")({
  head: () => ({ meta: [{ title: "White Label — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function Page() {
  return (
    <CrudResource
      table="white_label"
      title="White Label"
      description="Personalização de marca e domínio."
      singular="Marca"
      icon={<Palette className="h-6 w-6" />}
      fields={[
    {name:"brand_name", label:"Nome da marca", type:"text"},
    {name:"logo_url", label:"Logo URL", type:"url"},
    {name:"primary_color", label:"Cor primária", type:"text"},
    {name:"accent_color", label:"Cor de destaque", type:"text"},
    {name:"domain", label:"Domínio", type:"text"}
      ]}
    />
  );
}
