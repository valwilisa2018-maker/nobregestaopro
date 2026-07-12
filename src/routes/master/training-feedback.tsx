import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { GraduationCap, Star, MessageSquare, CheckCircle2, Users } from "lucide-react";

export const Route = createFileRoute("/master/training-feedback")({
  head: () => ({ meta: [{ title: "Feedback dos Treinamentos — Master" }] }),
  component: Page,
});

type Comment = { id: string; user_id: string; module_key: string; body: string; rating: number | null; created_at: string };
type Progress = { user_id: string; module_key: string; completed: boolean; rating: number | null; updated_at: string };
type Profile = { id: string; full_name: string | null };
type Module = { key: string; label: string; subtitle: string };

function Stars({ n }: { n: number | null }) {
  if (!n) return <span className="text-xs text-muted-foreground">sem nota</span>;
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star key={i} className={`h-3.5 w-3.5 ${i < n ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`} />
      ))}
    </div>
  );
}

function Page() {
  const [loading, setLoading] = useState(true);
  const [comments, setComments] = useState<Comment[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [modules, setModules] = useState<Module[]>([]);

  useEffect(() => {
    (async () => {
      const [c, p, m] = await Promise.all([
        supabase.from("training_comments").select("id,user_id,module_key,body,rating,created_at").order("created_at", { ascending: false }),
        supabase.from("training_progress").select("user_id,module_key,completed,rating,updated_at"),
        supabase.from("internal_config").select("value").eq("key", "training_modules").maybeSingle(),
      ]);
      const cs = (c.data as Comment[]) ?? [];
      const ps = (p.data as Progress[]) ?? [];
      setComments(cs);
      setProgress(ps);
      if (m.data?.value) { try { setModules(JSON.parse(m.data.value) as Module[]); } catch { /* ignore */ } }
      const ids = Array.from(new Set([...cs.map(x => x.user_id), ...ps.map(x => x.user_id)]));
      if (ids.length) {
        const { data: pr } = await supabase.from("profiles").select("id,full_name").in("id", ids);
        const map: Record<string, Profile> = {};
        (pr ?? []).forEach((x: Profile) => { map[x.id] = x; });
        setProfiles(map);
      }
      setLoading(false);
    })();
  }, []);

  const moduleLabel = (key: string) => modules.find(m => m.key === key)?.label ?? key;

  const stats = useMemo(() => {
    const ratings = [
      ...progress.filter(p => p.rating).map(p => p.rating as number),
      ...comments.filter(c => c.rating).map(c => c.rating as number),
    ];
    const avg = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : 0;
    const completions = progress.filter(p => p.completed).length;
    const students = new Set([...progress.map(p => p.user_id), ...comments.map(c => c.user_id)]).size;
    return { avg, ratingsCount: ratings.length, completions, students, commentsCount: comments.length };
  }, [progress, comments]);

  const byModule = useMemo(() => {
    const keys = Array.from(new Set([...progress.map(p => p.module_key), ...comments.map(c => c.module_key)]));
    return keys.map(k => {
      const rs = [
        ...progress.filter(p => p.module_key === k && p.rating).map(p => p.rating as number),
        ...comments.filter(c => c.module_key === k && c.rating).map(c => c.rating as number),
      ];
      const avg = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0;
      return {
        key: k,
        label: moduleLabel(k),
        avg,
        ratingsCount: rs.length,
        completions: progress.filter(p => p.module_key === k && p.completed).length,
        comments: comments.filter(c => c.module_key === k).length,
      };
    }).sort((a, b) => b.avg - a.avg);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress, comments, modules]);

  return (
    <PageShell
      title="Feedback dos Treinamentos"
      description="Notas e comentários enviados pelos alunos em cada módulo."
      icon={<GraduationCap className="h-6 w-6" />}
      status="ativo"
    >
      {loading ? (
        <div className="grid gap-3 md:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
      ) : (
        <>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <StatCard icon={Star} tone="amber" label="Nota média" value={stats.avg ? stats.avg.toFixed(2) : "—"} hint={`${stats.ratingsCount} avaliações`} />
            <StatCard icon={CheckCircle2} tone="emerald" label="Aulas concluídas" value={String(stats.completions)} hint="total de conclusões" />
            <StatCard icon={MessageSquare} tone="primary" label="Comentários" value={String(stats.commentsCount)} hint="mensagens enviadas" />
            <StatCard icon={Users} tone="violet" label="Alunos ativos" value={String(stats.students)} hint="com progresso ou comentário" />
          </div>

          <Card className="mt-4">
            <CardContent className="p-5">
              <p className="text-sm font-bold mb-3">Ranking por módulo</p>
              {byModule.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum dado ainda.</p>
              ) : (
                <div className="divide-y divide-border/50">
                  {byModule.map((m) => (
                    <div key={m.key} className="py-3 flex items-center gap-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold truncate">{m.label}</p>
                        <p className="text-[11px] text-muted-foreground">{m.completions} conclusões · {m.comments} comentários</p>
                      </div>
                      <Stars n={m.avg ? Math.round(m.avg) : null} />
                      <Badge variant="outline" className="tabular-nums">{m.avg ? m.avg.toFixed(2) : "—"}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="mt-4">
            <CardContent className="p-5">
              <div className="flex items-center gap-2 mb-3">
                <MessageSquare className="h-4 w-4 text-primary" />
                <p className="text-sm font-bold">Comentários dos alunos</p>
                <Badge variant="outline" className="ml-auto">{comments.length}</Badge>
              </div>
              {comments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum comentário até o momento.</p>
              ) : (
                <div className="space-y-3">
                  {comments.map((c) => (
                    <div key={c.id} className="rounded-lg border border-border/60 p-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{profiles[c.user_id]?.full_name ?? "Aluno"}</span>
                        <Badge variant="secondary" className="text-[10px]">{moduleLabel(c.module_key)}</Badge>
                        <Stars n={c.rating} />
                        <span className="ml-auto text-[11px] text-muted-foreground">{new Date(c.created_at).toLocaleString("pt-BR")}</span>
                      </div>
                      <p className="text-sm mt-2 whitespace-pre-wrap">{c.body}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </PageShell>
  );
}

function StatCard({ icon: Icon, tone, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; tone: "amber" | "emerald" | "primary" | "violet"; label: string; value: string; hint: string }) {
  const toneMap = {
    amber: "from-amber-500/20 to-amber-500/5 text-amber-400",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-400",
    primary: "from-primary/20 to-primary/5 text-primary",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-400",
  } as const;
  return (
    <Card className="relative overflow-hidden">
      <div className={`absolute inset-0 bg-gradient-to-br ${toneMap[tone].split(" ").slice(0, 2).join(" ")} opacity-60 pointer-events-none`} />
      <CardContent className="relative p-4">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
            <p className="text-2xl font-black mt-1 tabular-nums">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-1 truncate">{hint}</p>
          </div>
          <div className={`h-9 w-9 shrink-0 grid place-items-center rounded-xl bg-gradient-to-br ${toneMap[tone]} ring-1 ring-white/10`}>
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}