import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Loader2, Play, CheckCircle2, MessageCircle, Trash2, Send, Lock, ArrowLeft, RotateCcw, ChevronRight, Circle, Star, TrendingUp, BookOpen, Clock } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
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
  const raw = url.trim();
  if (!raw) return null;
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withScheme);
    if (u.hostname.includes("youtu.be")) {
      const id = u.pathname.split("/").filter(Boolean)[0] ?? "";
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }
    if (u.hostname.includes("youtube.com")) {
      let id = u.searchParams.get("v") ?? "";
      if (!id) {
        const parts = u.pathname.split("/").filter(Boolean);
        // /embed/ID, /shorts/ID, /live/ID, /v/ID
        const known = ["embed", "shorts", "live", "v"];
        const kIdx = parts.findIndex((p) => known.includes(p));
        id = kIdx >= 0 ? parts[kIdx + 1] ?? "" : parts[parts.length - 1] ?? "";
      }
      return { kind: "iframe", src: `https://www.youtube.com/embed/${id}?autoplay=1&rel=0` };
    }
    if (u.hostname.includes("vimeo.com")) {
      const id = u.pathname.split("/").filter(Boolean).pop() ?? "";
      return { kind: "iframe", src: `https://player.vimeo.com/video/${id}?autoplay=1` };
    }
    if (/\.(mp4|webm|ogg)(\?|$)/i.test(withScheme)) return { kind: "video", src: withScheme };
    return { kind: "iframe", src: withScheme };
  } catch { return null; }
}

type Comment = { id: string; user_id: string; module_key: string; body: string; rating: number | null; created_at: string; author_name?: string };

function TrainingPage() {
  const { user } = useAuth();
  const [modules, setModules] = useState<Module[]>(DEFAULT_MODULES);
  const [videos, setVideos] = useState<Record<string, string>>({});
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [ended, setEnded] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: v }, { data: c }, { data: mods }, prog] = await Promise.all([
        supabase.from("internal_config").select("value").eq("key", "tutorials").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "tutorial_covers").maybeSingle(),
        supabase.from("internal_config").select("value").eq("key", "training_modules").maybeSingle(),
        user ? supabase.from("training_progress").select("module_key,completed,rating").eq("user_id", user.id) : Promise.resolve({ data: [] as { module_key: string; completed: boolean; rating: number | null }[] }),
      ]);
      if (v?.value) { try { setVideos(JSON.parse(v.value)); } catch { /* ignore */ } }
      if (c?.value) { try { setCovers(JSON.parse(c.value)); } catch { /* ignore */ } }
      if (mods?.value) { try {
        const parsed = JSON.parse(mods.value) as Module[];
        if (Array.isArray(parsed) && parsed.length) setModules(parsed);
      } catch { /* ignore */ } }
      const p: Record<string, boolean> = {};
      const r: Record<string, number> = {};
      (prog.data ?? []).forEach((row: { module_key: string; completed?: boolean; rating?: number | null }) => {
        if (row.completed !== false) p[row.module_key] = true;
        if (row.rating) r[row.module_key] = row.rating;
      });
      setProgress(p);
      setRatings(r);
      setLoading(false);
    })();
  }, [user]);

  const openModule = modules.find((m) => m.key === openKey) ?? null;
  const openUrl = openKey ? videos[openKey] : "";
  const embed = openUrl ? toEmbed(openUrl) : null;
  const totalWatched = Object.values(progress).filter(Boolean).length;
  const pct = modules.length ? Math.round((totalWatched / modules.length) * 100) : 0;

  const nextModule = (() => {
    if (!openKey) return null;
    const idx = modules.findIndex((m) => m.key === openKey);
    if (idx < 0) return null;
    for (let i = idx + 1; i < modules.length; i++) {
      if (videos[modules[i].key]?.trim()) return modules[i];
    }
    return null;
  })();

  const markWatched = async (key: string, opts?: { silent?: boolean }) => {
    if (!user) { toast.error("Faça login para marcar como concluída"); return; }
    if (progress[key]) return;
    setProgress((p) => ({ ...p, [key]: true }));
    const { error } = await supabase.from("training_progress").upsert(
      { user_id: user.id, module_key: key, completed: true },
      { onConflict: "user_id,module_key" },
    );
    if (error) {
      setProgress((p) => { const { [key]: _drop, ...rest } = p; return rest; });
      toast.error(error.message);
      return;
    }
    if (!opts?.silent) toast.success("Aula concluída! 🎉");
  };

  const rateModule = async (key: string, value: number) => {
    if (!user) { toast.error("Faça login para avaliar"); return; }
    const prev = ratings[key];
    setRatings((r) => ({ ...r, [key]: value }));
    const { error } = await supabase.from("training_progress").upsert(
      { user_id: user.id, module_key: key, completed: true, rating: value },
      { onConflict: "user_id,module_key" },
    );
    if (error) {
      setRatings((r) => ({ ...r, [key]: prev ?? 0 }));
      toast.error(error.message);
      return;
    }
    setProgress((p) => ({ ...p, [key]: true }));
    toast.success(`Obrigado pela avaliação (${value}★)`);
  };

  const goNext = async () => {
    if (!openKey) return;
    await markWatched(openKey, { silent: true });
    if (nextModule) { setOpenKey(nextModule.key); setEnded(false); toast.success("Próxima aula 👉"); }
    else toast.success("Você concluiu todos os módulos disponíveis! 🎉");
  };

  const replay = () => {
    setEnded(false);
    if (videoRef.current) { videoRef.current.currentTime = 0; void videoRef.current.play(); }
  };

  useEffect(() => { setEnded(false); }, [openKey]);

  if (openKey && openModule) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-[#0b0d1a] via-[#0f1130] to-[#1a0b2e] text-foreground">
        {/* Top bar */}
        <div className="sticky top-0 z-30 border-b border-border bg-background/40 backdrop-blur-xl">
          <div className="mx-auto flex max-w-[1600px] items-center gap-4 px-4 py-3 sm:px-6">
            <Button variant="ghost" size="sm" onClick={() => setOpenKey(null)} className="gap-2 text-foreground/80 hover:bg-muted/60 hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            <div className="hidden min-w-0 flex-1 sm:block">
              <div className="truncate text-xs uppercase tracking-widest text-foreground/50">Curso AgentIA</div>
              <div className="truncate text-sm font-semibold">{openModule.label}</div>
            </div>
            <div className="flex min-w-[140px] items-center gap-3 sm:min-w-[220px]">
              <div className="hidden text-right sm:block">
                <div className="text-[10px] uppercase tracking-widest text-foreground/50">Progresso</div>
                <div className="text-sm font-bold tabular-nums">{pct}%</div>
              </div>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/60">
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} className="h-full rounded-full bg-gradient-to-r from-sky-400 via-indigo-500 to-fuchsia-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto grid max-w-[1600px] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* Player + info */}
          <div className="min-w-0 space-y-5">
            <div className="relative overflow-hidden rounded-2xl bg-background shadow-2xl ring-1 ring-white/10">
              <div className="relative w-full" style={{ aspectRatio: "16 / 9" }}>
                {embed?.kind === "iframe" ? (
                  <iframe src={embed.src} title={openModule.label} referrerPolicy="origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full" />
                ) : embed?.kind === "video" ? (
                  <video ref={videoRef} src={embed.src} controls autoPlay controlsList="nodownload" onEnded={() => { setEnded(true); if (openKey) void markWatched(openKey); }} className="absolute inset-0 h-full w-full" />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-foreground/60">Vídeo indisponível</div>
                )}

                <AnimatePresence>
                  {ended && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 grid place-items-center bg-background/80 backdrop-blur-sm">
                      <motion.div initial={{ scale: 0.9, y: 10 }} animate={{ scale: 1, y: 0 }} className="max-w-md p-6 text-center">
                        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-600 shadow-xl">
                          <CheckCircle2 className="h-8 w-8 text-foreground" />
                        </div>
                        <h3 className="mt-4 text-2xl font-black">🎉 Parabéns!</h3>
                        <p className="mt-1 text-sm text-foreground/70">Você concluiu esta aula.</p>
                        <div className="mt-5 flex flex-wrap justify-center gap-2">
                          <Button variant="outline" onClick={replay} className="gap-2 border-border bg-muted/40 text-foreground hover:bg-muted/60">
                            <RotateCcw className="h-4 w-4" /> Assistir novamente
                          </Button>
                          <Button onClick={goNext} className="gap-2 bg-gradient-to-r from-sky-500 to-fuchsia-500 hover:opacity-90">
                            Próxima aula <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/40 p-5 backdrop-blur-xl">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-xs uppercase tracking-widest text-foreground/50">{openModule.subtitle}</div>
                  <h1 className="mt-1 text-xl font-bold sm:text-2xl">{openModule.label}</h1>
                  <p className="mt-2 text-sm text-foreground/60">Instrutor: Equipe AgentIA · Atualizado recentemente</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => openKey && markWatched(openKey)} disabled={!!(openKey && progress[openKey])} className="gap-2 border-border bg-muted/40 text-foreground hover:bg-muted/60">
                    <CheckCircle2 className="h-4 w-4" /> {openKey && progress[openKey] ? "Concluída" : "Aula concluída"}
                  </Button>
                  <Button onClick={goNext} className="gap-2 bg-gradient-to-r from-sky-500 to-fuchsia-500 hover:opacity-90">
                    {nextModule ? "Próxima" : "Concluir"} <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-4">
                <span className="text-xs uppercase tracking-widest text-foreground/60">Gostou do conteúdo?</span>
                <StarRating value={ratings[openKey] ?? 0} onChange={(v) => rateModule(openKey, v)} />
                {ratings[openKey] ? <span className="text-xs text-foreground/50">Sua nota: {ratings[openKey]}/5</span> : null}
              </div>
            </div>

            <div className="rounded-2xl border border-border bg-muted/40 backdrop-blur-xl">
              <CommentsPanel moduleKey={openKey} />
            </div>
          </div>

          {/* Lesson list */}
          <aside className="lg:sticky lg:top-[76px] lg:self-start">
            <div className="overflow-hidden rounded-2xl border border-border bg-muted/40 backdrop-blur-xl">
              <div className="border-b border-border px-4 py-3">
                <div className="text-xs uppercase tracking-widest text-foreground/50">Curso AgentIA</div>
                <div className="text-sm font-semibold">Aulas do curso</div>
              </div>
              <ScrollArea className="max-h-[70vh]">
                <ul className="divide-y divide-white/5">
                  {modules.map((m, idx) => {
                    const active = m.key === openKey;
                    const done = !!progress[m.key];
                    const url = videos[m.key]?.trim();
                    const cover = covers[m.key]?.trim() || DEFAULT_COVERS[m.key];
                    return (
                      <li key={m.key}>
                        <button
                          disabled={!url}
                          onClick={() => { setOpenKey(m.key); setEnded(false); }}
                          className={cn(
                            "flex w-full items-center gap-3 p-3 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                            active ? "bg-gradient-to-r from-sky-500/20 to-fuchsia-500/10" : "hover:bg-muted/40",
                          )}
                        >
                          <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-lg bg-background">
                            {cover && <img src={cover} alt="" className="h-full w-full object-cover" />}
                            {active && <div className="absolute inset-0 grid place-items-center bg-background/50"><Play className="h-5 w-5 fill-white text-foreground" /></div>}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-foreground/50">
                              Aula {String(idx + 1).padStart(2, "0")}
                              {!url && <Lock className="h-3 w-3" />}
                            </div>
                            <div className="mt-0.5 truncate text-sm font-semibold">{m.label}</div>
                          </div>
                          <div className="shrink-0">
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                            ) : active ? (
                              <Play className="h-4 w-4 fill-sky-400 text-sky-400" />
                            ) : (
                              <Circle className="h-4 w-4 text-foreground/30" />
                            )}
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </ScrollArea>
            </div>
          </aside>
        </div>
      </div>
    );
  }

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
        <>
        <div className="mb-6 rounded-2xl border border-border/60 bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-semibold">Seu progresso</div>
              <div className="text-xs text-muted-foreground">
                {totalWatched} de {modules.length} aulas concluídas · {modules.length - totalWatched} restante{modules.length - totalWatched === 1 ? "" : "s"}
              </div>
            </div>
            <div className="text-2xl font-bold text-primary tabular-nums">
              {pct}%
            </div>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full rounded-full bg-gradient-to-r from-primary via-indigo-500 to-purple-600"
            />
          </div>
        </div>
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
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-emerald-500/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-lg">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Assistido
                  </div>
                )}
                {locked && (
                  <div className="absolute top-3 right-3 flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-semibold text-foreground/90 backdrop-blur">
                    <Lock className="h-3.5 w-3.5" /> Em breve
                  </div>
                )}

                <div className="absolute inset-0 grid place-items-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  <motion.div whileHover={{ scale: 1.1 }} className="grid h-20 w-20 place-items-center rounded-full bg-primary/95 text-primary-foreground shadow-2xl ring-4 ring-white/30">
                    <Play className="h-9 w-9 fill-current ml-1" />
                  </motion.div>
                </div>

                <div className="absolute bottom-0 left-0 right-0 p-4 text-foreground">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-foreground/70">{m.subtitle}</div>
                  <div className="mt-1 text-base font-bold leading-tight drop-shadow">{m.label}</div>
                </div>
              </motion.button>
            );
          })}
        </div>
        </>
      )}
    </PageShell>
  );
}

function CommentsPanel({ moduleKey }: { moduleKey: string }) {
  const { user } = useAuth();
  return <CommentsPanelInner moduleKey={moduleKey} user={user} />;
}

function StarRating({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  return (
    <div className="flex items-center gap-1" onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onMouseEnter={() => setHover(n)}
          onClick={() => onChange(n)}
          className="p-0.5 transition-transform hover:scale-110"
          aria-label={`Avaliar com ${n} estrela${n > 1 ? "s" : ""}`}
        >
          <Star className={cn("h-6 w-6 transition-colors", n <= active ? "fill-amber-400 text-amber-400" : "text-foreground/30")} />
        </button>
      ))}
    </div>
  );
}

function CommentsPanelInner({ moduleKey, user }: { moduleKey: string; user: ReturnType<typeof useAuth>["user"] }) {
  const [items, setItems] = useState<Comment[]>([]);
  const [body, setBody] = useState("");
  const [rating, setRating] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("training_comments")
      .select("id,user_id,module_key,body,rating,created_at")
      .eq("module_key", moduleKey)
      .eq("user_id", user?.id ?? "")
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
    const { error } = await supabase.from("training_comments").insert({ user_id: user.id, module_key: moduleKey, body: body.trim(), rating: rating || null });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    setBody("");
    setRating(0);
    load();
  };

  const remove = async (id: string) => {
    if (!user) return;
    const { error } = await supabase.from("training_comments").delete().eq("id", id).eq("user_id", user.id);
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
                      {c.rating ? (
                        <div className="mt-0.5 flex items-center gap-0.5">
                          {[1,2,3,4,5].map((n) => (
                            <Star key={n} className={cn("h-3 w-3", n <= (c.rating ?? 0) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30")} />
                          ))}
                        </div>
                      ) : null}
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
        <div className="flex items-center gap-2">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Sua nota:</span>
          <div className="flex items-center gap-0.5">
            {[1,2,3,4,5].map((n) => (
              <button key={n} type="button" onClick={() => setRating(n === rating ? 0 : n)} className="p-0.5 transition-transform hover:scale-110" aria-label={`${n} estrelas`}>
                <Star className={cn("h-4 w-4", n <= rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40")} />
              </button>
            ))}
          </div>
        </div>
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Escreva um comentário..." rows={2} className="resize-none" />
        <Button onClick={send} disabled={sending || !body.trim()} className="w-full gap-2" size="sm">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar
        </Button>
      </div>
    </div>
  );
}