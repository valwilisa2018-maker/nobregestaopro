import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { GraduationCap, Loader2, Play, CheckCircle2, MessageCircle, Trash2, Send, Lock } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import cover01 from "@/assets/modulo-01.png.asset.json";
import cover02 from "@/assets/modulo-02.png.asset.json";
import cover03 from "@/assets/modulo-03.png.asset.json";
import cover04 from "@/assets/modulo-04.png.asset.json";

export const Route = createFileRoute("/_authenticated/training")({
  head: () => ({ meta: [{ title: "Central de Treinamento — Plataforma" }] }),
  component: TrainingPage,
});

type Module = { key: string; label: string; subtitle: string; gradient: string };

const DEFAULT_MODULES: Module[] = [
  { key: "modulo_01", label: "Conhecendo a Plataforma", subtitle: "Módulo 01", gradient: "from-blue-600 via-indigo-600 to-purple-700" },
  { key: "modulo_02", label: "Conectando seu WhatsApp", subtitle: "Módulo 02", gradient: "from-emerald-500 via-teal-600 to-cyan-700" },
  { key: "modulo_03", label: "Automações Inteligentes", subtitle: "Módulo 03", gradient: "from-amber-500 via-orange-600 to-rose-700" },
  { key: "modulo_04", label: "Configurando seu Agente IA", subtitle: "Módulo 04", gradient: "from-fuchsia-600 via-purple-700 to-indigo-800" },
];

const DEFAULT_COVERS: Record<string, string> = {
  modulo_01: cover01.url,
  modulo_02: cover02.url,
  modulo_03: cover03.url,
  modulo_04: cover04.url,
};

function toEmbed(url: string): { kind: "iframe" | "video"; src: string } | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes("youtu.be")) return { kind: "iframe", src: `https://www.youtube.com/embed/${u.pathname.replace("/", "")}?autoplay=1&rel=0` };
    if (u.hostname.includes("youtube.com")) {
      const id = u.searchParams.get("v") ?? u.pathname.split("/").pop() ?? "";
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop() ?? "";
      return { kind: "iframe", src: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return { kind: "video", src: url };
    return { kind: "iframe", src: url };
  } catch { return null; }
}

type Comment = { id: string; user_id: string; module_key: string; body: string; created_at: string; author_name?: string };

function TrainingPage() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>(DEFAULT_MODULES);
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: c }, { data: mods }, prog] = await Promise.all([
        supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "tutorial_covers").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "training_modules").maybeSingle(),
        user ? supabase.from("training_progress").select("module_key").eq("user_id", user.id) : Promise.resolve({ data: [] as { module_key: string }[] }),
      ]);
      if (v?.value) { try { setVideos(JSON.parse(v.value)); } catch { /* ignore */ } }
      if (c?.value) { try { setCovers(JSON.parse(c.value)); } catch { /* ignore */ } }
      if (mods?.value) { try {
        const parsed = JSON.parse(mods.value) as Module[];
        if (Array.isArray(parsed) && parsed.length) setModules(parsed);
      } catch { /* ignore */ } }
      const p: Record<string, boolean> = {};
      (prog.data ?? []).forEach((r) => { p[r.module_key] = true; });
      setProgress(p);
      setLoading(false);
    })();
  }, [user]);

  const openModule = modules.find((m) => m.key === openKey) ?? null;
  const openUrl = openKey ? videos[openKey] : "";
  const embed = openUrl ? toEmbed(openUrl) : null;
  const totalWatched = Object.values(progress).filter(Boolean).length;

  const markWatched = async (key: string) => {
    if (!user || progress[key]) return;
    setProgress((p) => ({ ...p, [key]: true }));
    await supabase.from("training_progress").upsert({ user_id: user.id, module_key: key, completed: true }, { onConflict: "user_id,module_key" });
  };

  return (
    <PageShell
      title="Central de Treinamento"
      description={`Aprenda a dominar cada módulo da plataforma. ${totalWatched}/${modules.length} aulas concluídas.`}
      icon={<GraduationCap className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="flex justify-center py-24"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {modules.map((m, idx) => {
            const url = videos[m.key]?.trim();
            const cover = covers[m.key]?.trim() || DEFAULT_COVERS[m.key];
            const watched = !!progress[m.key];
            const locked = !url;
            return (
              <motion.button
                key={m.key}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.08 }}
                whileHover={{ y: -6 }}
                onClick={() => !locked && setOpenKey(m.key)}
                disabled={locked}
                className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card text-left shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ aspectRatio: "9 / 16" }}
              >
                {cover ? (
                  <img src={cover} alt={m.label} className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-110" />
                ) : (
                  <div className={`absolute inset-0 bg-gradient-to-br ${m.gradient} transition-transform duration-500 group-hover:scale-110`}>
                    <div className="absolute inset-0 opacity-30 mix-blend-overlay" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 50%), radial-gradient(circle at 80% 80%, white 0, transparent 40%)" }} />
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />

                {watched && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[11px] font-semibold text-white shadow-lg">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Assistido
                  </div>
                )}
                {locked && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white/90 backdrop-blur">
                    <Lock className="h-3.5 w-3.5" /> Em breve
                  </div>
                )}

                <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <motion.div whileHover={{ scale: 1.1 }} className="grid h-20 w-20 place-items-center rounded-full bg-primary/95 text-primary-foreground shadow-2xl ring-4 ring-white/30">
                    <Play className="h-9 w-9 fill-current ml-1" />
                  </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 text-white">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/70">{m.subtitle}</div>
                  <div className="mt-1 text-base font-bold leading-tight drop-shadow">{m.label}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
      )}

      <Dialog open={!!openKey} onOpenChange={(o) => !o && setOpenKey(null)}>
        <DialogContent className="max-w-5xl p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
              {openModule?.subtitle} — {openModule?.label}
              {openKey && progress[openKey] && <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 ml-2">Assistido</Badge>}
            </DialogTitle>
          </DialogHeader>
          {openKey && (
            <div className="grid lg:grid-cols-[1fr_360px] max-h-[80vh]">
              <div className="bg-black">
                <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                  {embed?.kind === "iframe" ? (
                    <iframe src={embed.src} title={openModule?.label} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
                  ) : embed?.kind === "video" ? (
                    <video src={embed.src} controls autoPlay className="absolute inset-0 h-full w-full" />
                  ) : null}
                </div>
                <div className="flex items-center justify-between gap-3 border-t p-4 bg-background">
                  <p className="text-sm text-muted-foreground">Marque como concluído após assistir a aula.</p>
                  <Button onClick={() => openKey && markWatched(openKey)} disabled={!openKey || !!progress[openKey]} className="gap-2">
                    <CheckCircle2 className="h-4 w-4" />
                    {openKey && progress[openKey] ? "Concluído" : "Marcar como assistido"}
                  </Button>
                </div>
              </div>
              <CommentsPanel moduleKey={openKey} />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function CommentsPanel({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  return <CommentsPanelInner moduleKey={moduleKey} user={user} />;
}

function ModuleEditor({
  module: mod,
  videoUrl,
  coverUrl,
  onCancel,
  onSave,
}: {
  module: Module;
  videoUrl: string;
  coverUrl: string;
  onCancel: () => void;
  onSave: (patch: Module, videoUrl: string, coverUrl: string) => void | Promise<void>;
}) {
  void mod; void videoUrl; void coverUrl; void onCancel; void onSave;
  return null;
}

function CommentsPanelInner({ moduleKey, user }: { moduleKey: string; user: ReturnType<typeof useAuth>["user"] }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("training_comments")
      .select("id,user_id,module_key,body,created_at")
      .eq("module_key", moduleKey)
      .order("created_at", { ascending: false })
      .limit(200);
    const rows = (data ?? []) as Comment[];
    const ids = Array.from(new Set(rows.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name").in("id", ids);
      const map = new Map((profs ?? []).map((p) => [p.id, p.full_name as string | null]));
      rows.forEach((r) => { r.author_name = map.get(r.user_id) ?? "Aluno"; });
    }
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [moduleKey]);

  const send = async () => {
    if (!user || !body.trim()) return;
    setSending(true);
    const { error } = await supabase.from("training_comments").insert({ user_id: user.id, module_key: moduleKey, body: body.trim() });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("training_comments").delete().eq("id", id);
    if (error) toast.error(error.message); else setItems((prev) => prev.filter((c) => c.id !== id));
  };

  const initials = useMemo(() => (name?: string) => (name ?? "A").split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase(), []);

  return (
    <div className="flex flex-col border-l bg-card min-h-0">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm font-semibold">
        <MessageCircle className="h-4 w-4 text-primary" /> Comentários ({items.length})
      </div>
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">Seja o primeiro a comentar nesta aula.</p>
          ) : (
            <AnimatePresence initial={false}>
              {items.map((c) => (
                <motion.div key={c.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="rounded-lg border border-border/60 bg-background p-3">
                  <div className="flex items-start gap-2">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary text-xs font-bold">{initials(c.author_name)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold truncate">{c.author_name}</div>
                        <div className="text-[10px] text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}</div>
                      </div>
                      <p className="text-sm mt-0.5 whitespace-pre-wrap break-words">{c.body}</p>
                    </div>
                    {user?.id === c.user_id && (
                      <button onClick={() => remove(c.id)} className="text-muted-foreground hover:text-destructive transition-colors" aria-label="Excluir">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      </ScrollArea>
      <div className="border-t p-3 space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário..." rows={2} className="resize-none" />
        <Button onClick={send} disabled={sending || !body.trim()} className="w-full gap-2" size="sm">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
        </Button>
      </div>
    </div>
  );
}