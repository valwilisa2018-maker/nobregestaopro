import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Palette, Upload, RotateCcw, Trash2 } from "lucide-react";
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
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase
      .from("internal_config")
      .select("value")
      .eq("key", "branding")
      .maybeSingle()
      .then(({ data }) => {
        if (data?.value) {
          try {
            setBranding(JSON.parse(data.value) as Branding);
          } catch {
            /* ignore */
          }
        }
        setLoading(false);
      });
  }, []);

  const save = async () => {
    setSaving(true);
    const value = JSON.stringify(branding);
    const { data: existing } = await supabase
      .from("internal_config")
      .select("key")
      .eq("key", "branding")
      .maybeSingle();
    const { error } = existing
      ? await supabase.from("internal_config").update({ value }).eq("key", "branding")
      : await supabase.from("internal_config").insert({ key: "branding", value });
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Personalização salva");
  };

  const reset = () => setBranding({ maintenance_logo_url: "" });

  const onPickFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione uma imagem (PNG, JPG ou SVG).");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Imagem muito grande. Máximo 2MB.");
      return;
    }
    setUploading(true);
    try {
      const dataUrl: string = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      setBranding((b) => ({ ...b, maintenance_logo_url: dataUrl }));
      toast.success("Logo carregada. Clique em Salvar para aplicar.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const preview = branding.maintenance_logo_url?.trim() || logoAsset.url;

  return (
    <PageShell
      title="Personalização"
      description="Configure o logo exibido na tela de manutenção."
      icon={<Palette className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="p-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 space-y-6">
            <div className="grid gap-6 md:grid-cols-[1fr_240px] items-start">
              <div className="space-y-3">
                <Label className="flex items-center gap-2 text-xs">
                  <Upload className="h-3.5 w-3.5 text-primary" /> Logo da tela de manutenção
                </Label>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void onPickFile(f);
                  }}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {branding.maintenance_logo_url ? "Trocar imagem" : "Enviar imagem"}
                  </Button>
                  {branding.maintenance_logo_url && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setBranding((b) => ({ ...b, maintenance_logo_url: "" }))}
                      className="gap-2"
                    >
                      <Trash2 className="h-4 w-4" /> Remover
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Envie PNG, JPG, WEBP ou SVG (até 2MB). Sem logo enviada, usamos o padrão.
                </p>
              </div>
              <div className="rounded-xl border border-primary/20 bg-background/50 p-4 flex flex-col items-center gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                  Pré-visualização
                </span>
                <img
                  src={preview}
                  alt="Pré-visualização do logo"
                  className="h-24 w-24 rounded-2xl object-cover ring-1 ring-primary/30"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = logoAsset.url;
                  }}
                />
              </div>
            </div>
            <div className="flex justify-between gap-2">
              <Button variant="outline" onClick={reset} className="gap-2">
                <RotateCcw className="h-4 w-4" /> Restaurar padrão
              </Button>
              <Button onClick={save} disabled={saving} size="lg" className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}{" "}
                Salvar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
