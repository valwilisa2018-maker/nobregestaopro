import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Save, PlayCircle, Video, Plus, Trash2, Upload, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { DndContext, PointerSensor, KeyboardSensor, useSensor, useSensors, closestCenter, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import cover01 from "@/assets/modulo-01.png.asset.json";
import cover02 from "@/assets/modulo-02.png.asset.json";
import cover03 from "@/assets/modulo-03.png.asset.json";
import cover04 from "@/assets/modulo-04.png.asset.json";

const DEFAULT_COVERS: Record<string, string> = {
  modulo_01: cover01.url,
  modulo_02: cover02.url,
  modulo_03: cover03.url,
  modulo_04: cover04.url,
};

export const Route = createFileRoute("/master/tutorials")({
  head: () => ({ meta: [{ title: "Tutoriais em vídeo — Master" }] }),
  component: Page,
});

type Tutorials = Record<string, string>;
type Module = { key: string; label: string; subtitle: string; gradient: string };

const DEFAULT_MODULES: Module[] = [
  { key: "modulo_01", label: "Conhecendo a Plataforma", subtitle: "Módulo 01", gradient: "from-blue-600 via-indigo-600 to-purple-700" },
  { key: "modulo_02", label: "Conectando seu WhatsApp", subtitle: "Módulo 02", gradient: "from-emerald-500 via-teal-600 to-cyan-700" },
  { key: "modulo_03", label: "Automações Inteligentes", subtitle: "Módulo 03", gradient: "from-amber-500 via-orange-600 to-rose-700" },
  { key: "modulo_04", label: "Configurando seu Agente IA", subtitle: "Módulo 04", gradient: "from-fuchsia-600 via-purple-700 to-indigo-800" },
];

const GRADIENTS = [
  "from-blue-600 via-indigo-600 to-purple-700",
  "from-emerald-500 via-teal-600 to-cyan-700",
  "from-amber-500 via-orange-600 to-rose-700",
  "from-fuchsia-600 via-purple-700 to-indigo-800",
  "from-pink-500 via-rose-600 to-red-700",
  "from-slate-600 via-slate-700 to-slate-900",
];

function Page() {
  const [modules, setModules] = useState<Module[]>(DEFAULT_MODULES);
  const [videos, setVideos] = useState<Tutorials>({});
  const [covers, setCovers] = useState<Tutorials>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: c }, { data: m }] = await Promise.all([
        supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "tutorial_covers").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "training_modules").maybeSingle(),
      ]);
      if (v?.value) { try { setVideos(JSON.parse(v.value) as Tutorials); } catch { /* ignore */ } }
      if (c?.value) { try { setCovers(JSON.parse(c.value) as Tutorials); } catch { /* ignore */ } }
      if (m?.value) { try {
        const parsed = JSON.parse(m.value) as Module[];
        if (Array.isArray(parsed) && parsed.length) setModules(parsed);
      } catch { /* ignore */ } }
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
    const r3 = await saveKey("training_modules", JSON.stringify(modules));
    setSaving(false);
    const err = r1.error || r2.error || r3.error;
    if (err) toast.error(err.message); else toast.success("Tutoriais salvos");
  };

  const addModule = () => {
    const n = modules.length + 1;
    const key = `modulo_${Date.now().toString(36)}`;
    setModules((prev) => [...prev, { key, label: "Novo módulo", subtitle: `Módulo ${String(n).padStart(2, "0")}`, gradient: GRADIENTS[n % GRADIENTS.length] }]);
  };

  const removeModule = (key: string) => {
    if (!confirm("Excluir este módulo?")) return;
    setModules((prev) => prev.filter((m) => m.key !== key));
    setVideos((v) => { const { [key]: _v, ...rest } = v; return rest; });
    setCovers((v) => { const { [key]: _c, ...rest } = v; return rest; });
  };

  const patchModule = (key: string, patch: Partial<Module>) => {
    setModules((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  };

  const move = (key: string, dir: -1 | 1) => {
    setModules((prev) => {
      const i = prev.findIndex((m) => m.key === key);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setModules((prev) => {
      const oldIndex = prev.findIndex((m) => m.key === active.id);
      const newIndex = prev.findIndex((m) => m.key === over.id);
      if (oldIndex < 0 || newIndex < 0) return prev;
      return arrayMove(prev, oldIndex, newIndex);
    });
    toast.success("Ordem atualizada — clique em Salvar para confirmar.");
  };

  const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
  const MAX_BYTES = 2 * 1024 * 1024;

  const onFile = (key: string, f: File | null) => {
    if (!f) return;
    if (!ALLOWED_TYPES.includes(f.type)) {
      toast.error("Formato inválido", { description: "Use PNG, JPG, WEBP ou GIF." });
      return;
    }
    if (f.size > MAX_BYTES) {
      const mb = (f.size / (1024 * 1024)).toFixed(2);
      toast.error(`Arquivo muito grande (${mb}MB)`, { description: "Tamanho máximo permitido: 2MB. Reduza a imagem ou informe uma URL." });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const ratio = img.width / img.height;
        if (ratio > 0.85) {
          toast.warning("Proporção fora do padrão 9:16", { description: `A capa tem ${img.width}×${img.height}px. O ideal é vertical (ex.: 720×1280).` });
        }
        setCovers((c) => ({ ...c, [key]: String(reader.result) }));
        toast.success("Capa carregada", { description: `${f.name} · ${(f.size / 1024).toFixed(0)} KB` });
      };
      img.onerror = () => toast.error("Não foi possível ler a imagem", { description: "Arquivo corrompido ou formato não suportado." });
      img.src = String(reader.result);
    };
    reader.onerror = () => toast.error("Falha ao ler o arquivo", { description: "Tente novamente ou use outro arquivo." });
    reader.readAsDataURL(f);
  };

  return (
    <PageShell
      title="Tutoriais em vídeo"
      description="Adicione, edite ou reordene os módulos da Central de Treinamento. Suba a capa (9:16) e cole o link do vídeo."
      icon={<Video className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
          <CardContent className="p-6 space-y-5">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={modules.map((m) => m.key)} strategy={verticalListSortingStrategy}>
                {modules.map((m, idx) => (
                  <SortableRow
                    key={m.key}
                    m={m}
                    idx={idx}
                    total={modules.length}
                    cover={covers[m.key] || DEFAULT_COVERS[m.key]}
                    videoUrl={videos[m.key] ?? ""}
                    coverUrl={covers[m.key] ?? ""}
                    onMove={move}
                    onRemove={removeModule}
                    onPatch={patchModule}
                    onVideo={(k, v) => setVideos((prev) => ({ ...prev, [k]: v }))}
                    onCoverUrl={(k, v) => setCovers((prev) => ({ ...prev, [k]: v }))}
                    onFile={onFile}
                  />
                ))}
              </SortableContext>
            </DndContext>
            <div className="flex justify-between">
              <Button variant="outline" onClick={addModule} className="gap-2"><Plus className="h-4 w-4" /> Novo módulo</Button>
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

type RowProps = {
  m: Module;
  idx: number;
  total: number;
  cover?: string;
  videoUrl: string;
  coverUrl: string;
  onMove: (key: string, dir: -1 | 1) => void;
  onRemove: (key: string) => void;
  onPatch: (key: string, patch: Partial<Module>) => void;
  onVideo: (key: string, v: string) => void;
  onCoverUrl: (key: string, v: string) => void;
  onFile: (key: string, f: File | null) => void;
};

function SortableRow({ m, idx, total, cover, videoUrl, coverUrl, onMove, onRemove, onPatch, onVideo, onCoverUrl, onFile }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: m.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className="rounded-lg border border-border/60 p-4 space-y-3 bg-background">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground" aria-label="Arrastar para reordenar">
            <GripVertical className="h-4 w-4" />
          </button>
          <PlayCircle className="h-4 w-4 text-primary" /> {m.subtitle} — {m.label}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={() => onMove(m.key, -1)} disabled={idx === 0} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onMove(m.key, 1)} disabled={idx === total - 1} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" onClick={() => onRemove(m.key)} className="text-destructive hover:text-destructive" aria-label="Excluir"><Trash2 className="h-4 w-4" /></Button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[140px_1fr]">
        <div className="space-y-2">
          <div className="overflow-hidden rounded-lg border bg-muted" style={{ aspectRatio: "9/16" }}>
            {cover ? <img src={cover} alt="capa" className="h-full w-full object-cover" /> : <div className="h-full w-full grid place-items-center text-xs text-muted-foreground">Sem capa</div>}
          </div>
          <label className="flex items-center justify-center gap-1 rounded-md border border-input bg-background px-2 py-1.5 text-xs cursor-pointer hover:bg-accent">
            <Upload className="h-3.5 w-3.5" /> Enviar capa
            <input type="file" accept="image/*" className="hidden" onChange={(e) => onFile(m.key, e.target.files?.[0] ?? null)} />
          </label>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[110px_1fr] gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Rótulo</Label>
              <Input value={m.subtitle} onChange={(e) => onPatch(m.key, { subtitle: e.target.value })} placeholder="Módulo 01" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Título</Label>
              <Input value={m.label} onChange={(e) => onPatch(m.key, { label: e.target.value })} placeholder="Nome do módulo" />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL do vídeo (YouTube, Vimeo ou MP4)</Label>
            <Input placeholder="https://www.youtube.com/watch?v=..." value={videoUrl} onChange={(e) => onVideo(m.key, e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">URL da capa (opcional se você enviou o arquivo)</Label>
            <Input placeholder="https://.../capa.jpg" value={coverUrl} onChange={(e) => onCoverUrl(m.key, e.target.value)} />
          </div>
        </div>
      </div>
    </div>
  );
}