import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Phone, Mail, MessageCircle, Settings2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/support-settings")({
  head: () => ({ meta: [{ title: "Configurações de Suporte — Master" }] }),
  component: Page,
});

type SupportContacts = {
  phone?: string;
  email?: string;
  whatsapp?: string;
  whatsapp_message?: string;
};

function Page() {
  const [contacts, setContacts] = useState<SupportContacts>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("internal_config")
      .select("value")
      .eq("key", "support_contacts")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            setContacts(JSON.parse(data.value) as SupportContacts);
          } catch {
            /* ignore */
          }
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const value = JSON.stringify(contacts);
    const { data: existing } = await supabase
      .from("internal_config")
      .select("key")
      .eq("key", "support_contacts")
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "support_contacts")
      : await supabase.from("internal_config").insert({ key: "support_contacts", value });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Contatos salvos com sucesso");
  };

  return (
    <PageShell
      title="Configurações de Suporte"
      description="Canais de contato exibidos para os clientes na Central de Suporte."
      icon={<Settings2 className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs">
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-500" /> WhatsApp (com DDI)
                </Label>
                <Input
                  placeholder="+5511999999999"
                  value={contacts.whatsapp ?? ""}
                  onChange={(e) => setContacts((c) => ({ ...c, whatsapp: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs">
                  <Phone className="h-3.5 w-3.5 text-primary" /> Telefone
                </Label>
                <Input
                  placeholder="(11) 9999-9999"
                  value={contacts.phone ?? ""}
                  onChange={(e) => setContacts((c) => ({ ...c, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="flex items-center gap-2 text-xs">
                  <Mail className="h-3.5 w-3.5 text-blue-500" /> E-mail
                </Label>
                <Input
                  type="email"
                  placeholder="suporte@empresa.com"
                  value={contacts.email ?? ""}
                  onChange={(e) => setContacts((c) => ({ ...c, email: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Mensagem inicial do WhatsApp (opcional)</Label>
              <Input
                placeholder="Olá, preciso de ajuda com..."
                value={contacts.whatsapp_message ?? ""}
                onChange={(e) => setContacts((c) => ({ ...c, whatsapp_message: e.target.value }))}
              />
            </div>
            <div className="flex justify-end">
              <Button onClick={save} disabled={saving} size="lg" className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Salvar contatos
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
