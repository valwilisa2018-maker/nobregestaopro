import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Palette, Image as ImageIcon, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";

export const Route = createFileRoute("/master/branding")({
  head: () => ({ meta: [{ title: "Personalização — Master" }] }),
  component: Page,
});

type Branding = { maintenance_logo_url?: string };

function Page() {
  const [branding, setBranding] = useState<Branding>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from("internal_config").select("value").eq("key", "branding").maybeSingle()
      .then(({ data }) => {
        if (data?.value) { try { setBranding(JSON.parse(data.value) as Branding); } catch { /* ignore */ } }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const value = JSON.stringify(branding);
    const { data: existing } = await supabase.from("internal_config").select("key").eq("key", "branding").maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "branding")
      : await supabase.from("internal_config").insert({ key: "branding", value });
    setSaving(false);
    if (error) toast.error(error.message); else toast.success("Personalização salva");
  };

  const reset = () => setBranding({ maintenance_logo_url: "" });

  const preview = branding.maintenance_logo_url?.trim() || logoAsset.url;

  return (
    <PageShell
      title="Personalização"
      description="Configure o logo exibido na tela de manutenção."
      icon={<Palette className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-[1fr_240px] items-start">
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-xs">
                  <ImageIcon className="h-3.5 w-3.5 text-primary" /> URL do logo (tela de manutenção)
                </Label>
                <Input
                  placeholder="https://... (cole o link de uma imagem PNG/JPG/SVG)"
                  value={branding.maintenance_logo_url ?? ""}
                  onChange={(e) => setBranding((b) => ({ ...b, maintenance_logo_url: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">
                  Deixe em branco para usar o logo padrão. Dica: envie a imagem em qualquer serviço público
                  (ex.: postimg.cc, imgur, Google Drive público) e cole o link direto aqui.
                </p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-background/50 p-4 flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Pré-visualização</span>
                <img
                  src={preview}
                  alt="Pré-visualização do logo"
                  className="h-24 w-24 rounded-2xl object-cover ring-1 ring-primary/30"
                  onError={(e) => { (e.currentTarget as HTMLImageElement).src = logoAsset.url; }}
                />
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Restaurar padrão
              </Button>
              <Button onClick={save} disabled={saving} size="lg" className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}