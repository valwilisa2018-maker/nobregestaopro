import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { TutorialVideo } from "@/components/tutorial-video";
import { GraduationCap, Loader2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({ meta: [{ title: "Central de Treinamento — Plataforma" }] }),
  component: TrainingPage,
});

const MODULES: Array<{ key: string; label: string }> = [
  { key: "modulo_01", label: "Módulo 01 — Conhecendo a Plataforma" },
  { key: "modulo_02", label: "Módulo 02 — Conectando seu WhatsApp" },
  { key: "modulo_03", label: "Módulo 03 — Automações Inteligentes" },
  { key: "modulo_04", label: "Módulo 04 — Configurando seu Agente IA" },
];

function TrainingPage() {
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle()
      .then(({ data }) => {
        if (data?.value) { try { setVideos(JSON.parse(data.value)); } catch { /* ignore */ } }
        setLoading(false);
      });
  }, []);

  const available = MODULES.filter((m) => videos[m.key]?.trim());

  return (
    <PageShell
      title="Central de Treinamento"
      description="Assista aos vídeos oficiais e aprenda a usar cada módulo da plataforma."
      icon={<GraduationCap className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : available.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-24">
          Nenhum vídeo de treinamento disponível no momento. Volte em breve!
        </div>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {available.map((m) => (
            <TutorialVideo key={m.key} moduleKey={m.key} title={m.label} />
          ))}
        </div>
      )}
    </PageShell>
  );
}