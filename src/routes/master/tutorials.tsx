import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, PlayCircle, Video } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/master/tutorials")({
  head: () => ({ meta: [{ title: "Tutoriais em vídeo — Master" }] }),
  component: Page,
});

type Tutorials = Record<string, string>;

const MODULES: Array<{ key: string; label: string; hint: string }> = [
  { key: "modulo_01", label: "Módulo 01 — Conhecendo a Plataforma", hint: "Dashboard moderno, IA, gráficos e interface da plataforma." },
  { key: "modulo_02", label: "Módulo 02 — Conectando seu WhatsApp", hint: "Smartphone, WhatsApp, QR Code, conexões e integração." },
  { key: "modulo_03", label: "Módulo 03 — Automações Inteligentes", hint: "Fluxos, robô de IA, automações, gatilhos e conexões entre blocos." },
  { key: "modulo_04", label: "Módulo 04 — Configurando seu Agente IA", hint: "Cérebro de IA, chatbot, configurações, prompt e inteligência artificial." },
];

function Page() {
  const [videos, setVideos] = useState<Tutorials>({});
  const [covers, setCovers] = useState<Tutorials>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: v } = await supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle();
      if (v?.value) { try { setVideos(JSON.parse(v.value) as Tutorials); } catch { /* ignore */ } }
      const { data: c } = await supabase.from("internal_config").select("value").eq("key", "tutorial_covers").maybeSingle();
      if (c?.value) { try { setCovers(JSON.parse(c.value) as Tutorials); } catch { /* ignore */ } }
      setLoading(false);
    })();
  }, []);

  const saveKey = async (key: string, value: string) => {
    const { data: existing } = await supabase.from("internal_config").select("key").eq("key", key).maybeSingle();
    return existing
      ? await supabase.from("internal_config").update({ value }).eq("key", key)
      : await supabase.from("internal_config").insert({ key, value });
  };

  const save = async () => {
    setSaving(true);
    const r1 = await saveKey("tutorials", JSON.stringify(videos));
    const r2 = await saveKey("tutorial_covers", JSON.stringify(covers));
    setSaving(false);
    const err = r1.error || r2.error;
    if (err) toast.error(err.message); else toast.success("Tutoriais salvos");
  };

  return (
    <PageShell
      title="Tutoriais em vídeo"
      description="Cole o link (YouTube, Vimeo, MP4) do tutorial de cada módulo. Ficará visível para os clientes na respectiva página."
      icon={<Video className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 space-y-5">
            {MODULES.map((m) => (
              <div key={m.key} className="space-y-2 rounded-lg border border-border/60 p-3">
                <Label className="flex items-center gap-2 text-sm">
                  <PlayCircle className="h-4 w-4 text-primary" /> {m.label}
                </Label>
                <Input
                  placeholder="https://www.youtube.com/watch?v=... ou https://player.vimeo.com/video/... ou .mp4"
                  value={videos[m.key] ?? ""}
                  onChange={(e) => setVideos((v) => ({ ...v, [m.key]: e.target.value }))}
                />
                <Input
                  placeholder="URL da capa vertical 9:16 (jpg/png)"
                  value={covers[m.key] ?? ""}
                  onChange={(e) => setCovers((v) => ({ ...v, [m.key]: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">{m.hint}</p>
              </div>
            ))}
            <div className="flex justify-end">
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