import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Plus, Pencil, Trash2, Search, FileText, Link2, Type, Loader2, Inbox, Bot } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/knowledge")({
  head: () => ({ meta: [{ title: "Base de Conhecimento — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type SourceType = "text" | "url" | "pdf";

type KbDoc = {
  id: string;
  user_id: string;
  agent_id: string | null;
  title: string;
  source_type: SourceType;
  source_url: string | null;
  content: string | null;
  tokens: number;
  updated_at: string;
};

type AgentOpt = { id: string; name: string };

const SOURCE_META: Record<SourceType, { label: string; icon: typeof Type; cls: string }> = {
  text: { label: "Texto", icon: Type, cls: "bg-primary/15 text-primary border-primary/30" },
  url: { label: "URL", icon: Link2, cls: "bg-accent/40 text-primary border-primary/30" },
  pdf: { label: "PDF", icon: FileText, cls: "bg-muted text-muted-foreground border-border" },
};

function estimateTokens(s: string) {
  return Math.ceil((s || "").length / 4);
}

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<KbDoc[]>([]);
  const [agents, setAgents] = useState<AgentOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<KbDoc | null>(null);
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [agentId, setAgentId] = useState<string>("none");
  const [sourceType, setSourceType] = useState<SourceType>("text");
  const [sourceUrl, setSourceUrl] = useState("");
  const [content, setContent] = useState("");

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [{ data: kb, error }, { data: ag }] = await Promise.all([
      supabase.from("knowledge_documents").select("*").eq("user_id", user.id).order("updated_at", { ascending: false }),
      supabase.from("agents").select("id,name").eq("user_id", user.id).order("name"),
    ]);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((kb ?? []) as KbDoc[]);
    setAgents((ag ?? []) as AgentOpt[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (agentFilter === "global" && r.agent_id) return false;
      if (agentFilter !== "all" && agentFilter !== "global" && r.agent_id !== agentFilter) return false;
      if (!q) return true;
      const s = `${r.title} ${r.content ?? ""} ${r.source_url ?? ""}`.toLowerCase();
      return s.includes(q.toLowerCase());
    });
  }, [rows, q, agentFilter]);

  const totalTokens = useMemo(() => rows.reduce((a, r) => a + (r.tokens || 0), 0), [rows]);

  const reset = () => {
    setTitle(""); setAgentId("none"); setSourceType("text");
    setSourceUrl(""); setContent(""); setEditing(null);
  };

  const openCreate = () => { reset(); setOpen(true); };
  const openEdit = (r: KbDoc) => {
    setEditing(r);
    setTitle(r.title);
    setAgentId(r.agent_id ?? "none");
    setSourceType(r.source_type);
    setSourceUrl(r.source_url ?? "");
    setContent(r.content ?? "");
    setOpen(true);
  };

  const importFromUrl = async () => {
    if (!sourceUrl) return toast.error("Informe a URL");
    try {
      toast.loading("Buscando conteúdo…", { id: "kb-url" });
      const res = await fetch(sourceUrl);
      const html = await res.text();
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      setContent(text.slice(0, 40000));
      if (!title) setTitle(sourceUrl.replace(/^https?:\/\//, "").slice(0, 80));
      toast.success("Conteúdo importado", { id: "kb-url" });
    } catch (e) {
      toast.error("Falha ao buscar URL", { id: "kb-url" });
    }
  };

  const save = async () => {
    if (!user) return;
    if (!title.trim()) return toast.error("Título obrigatório");
    if (sourceType !== "url" && !content.trim()) return toast.error("Conteúdo obrigatório");
    setSaving(true);
    const payload = {
      user_id: user.id,
      agent_id: agentId === "none" ? null : agentId,
      title: title.trim(),
      source_type: sourceType,
      source_url: sourceUrl.trim() || null,
      content: content.trim() || null,
      tokens: estimateTokens(content),
    };
    const q = editing
      ? supabase.from("knowledge_documents").update(payload).eq("id", editing.id).eq("user_id", user.id)
      : supabase.from("knowledge_documents").insert(payload);
    const { error } = await q;
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(editing ? "Atualizado" : "Criado");
    setOpen(false);
    reset();
    load();
  };

  const remove = async (r: KbDoc) => {
    if (!confirm(`Excluir "${r.title}"?`)) return;
    if (!user) return;
    const { error } = await supabase.from("knowledge_documents").delete().eq("id", r.id).eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Excluído");
    load();
  };

  return (
    <PageShell>
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-violet-500 shadow-[0_10px_30px_-10px_rgba(139,92,246,0.7)] ring-1 ring-white/20">
              <BookOpen className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Base de Conhecimento
                </h1>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">Ativo</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Alimente seus agentes com contexto: textos, URLs e documentos consultados na hierarquia de resposta.</p>
            </div>
          </div>
          <Button onClick={openCreate} className="bg-gradient-to-br from-blue-500 to-violet-500 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.7)] hover:opacity-90">
            <Plus className="mr-2 h-4 w-4" /> Novo documento
          </Button>
        </div>

        <div className="relative mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Documentos" value={rows.length} icon={<BookOpen className="h-4 w-4" />} tone="from-blue-500/25 to-cyan-500/10" ring="ring-blue-500/30" />
          <StatCard label="Tokens estimados" value={totalTokens.toLocaleString("pt-BR")} icon={<Type className="h-4 w-4" />} tone="from-violet-500/25 to-fuchsia-500/10" ring="ring-violet-500/30" />
          <StatCard label="Agentes com KB" value={new Set(rows.map((r) => r.agent_id).filter(Boolean)).size} icon={<Bot className="h-4 w-4" />} tone="from-emerald-500/25 to-teal-500/10" ring="ring-emerald-500/30" />
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-card/60 p-4 backdrop-blur-xl">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por título ou conteúdo…" className="h-10 border-white/10 bg-background/60 pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="h-10 border-white/10 bg-background/60 sm:w-64"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os agentes</SelectItem>
              <SelectItem value="global">Global (sem agente)</SelectItem>
              {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-white/10 bg-gradient-to-b from-card/60 to-card/30 backdrop-blur-xl">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-16 text-center space-y-4">
              <div className="relative mx-auto grid h-20 w-20 place-items-center">
                <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-500/30 to-violet-500/20 blur-xl" />
                <div className="relative grid h-20 w-20 place-items-center rounded-2xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300 ring-1 ring-white/10">
                  <Inbox className="h-8 w-8" />
                </div>
              </div>
              <div>
                <p className="text-lg font-medium">Nenhum documento na base ainda.</p>
                <p className="text-sm text-muted-foreground">Adicione textos, URLs ou PDFs para alimentar seus agentes.</p>
              </div>
              <Button onClick={openCreate} className="bg-gradient-to-br from-blue-500 to-violet-500 text-white hover:opacity-90">
                <Plus className="mr-2 h-4 w-4" /> Adicionar primeiro documento
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-white/5">
              {filtered.map((r) => {
                const m = SOURCE_META[r.source_type] ?? SOURCE_META.text;
                const Icon = m.icon;
                const agent = agents.find((a) => a.id === r.agent_id);
                return (
                  <li key={r.id} className="group flex items-start gap-3 p-4 transition-colors hover:bg-white/[0.03]">
                    <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 text-blue-300 ring-1 ring-white/10">
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold truncate">{r.title}</h3>
                        <Badge variant="outline" className={`rounded-full ${m.cls}`}>{m.label}</Badge>
                        <Badge variant="outline" className="rounded-full border-white/10 bg-white/5">{agent ? agent.name : "Global"}</Badge>
                        <span className="text-xs text-muted-foreground">~{(r.tokens || 0).toLocaleString("pt-BR")} tokens</span>
                      </div>
                      {r.content && (
                        <p className="text-sm text-muted-foreground line-clamp-2 mt-1">{r.content}</p>
                      )}
                      {r.source_url && (
                        <a href={r.source_url} target="_blank" rel="noreferrer"
                          className="text-xs text-primary hover:underline truncate block mt-1">
                          {r.source_url}
                        </a>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEdit(r)} aria-label="Editar">
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => remove(r)} aria-label="Excluir">
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar documento" : "Novo documento"}</DialogTitle>
            <DialogDescription>
              O conteúdo será consultado pelo agente respeitando a hierarquia da base de conhecimento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex.: Política de troca" />
              </div>
              <div className="space-y-2">
                <Label>Agente</Label>
                <Select value={agentId} onValueChange={setAgentId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Global (todos os agentes)</SelectItem>
                    {agents.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tipo de fonte</Label>
              <div className="grid grid-cols-3 gap-2">
                {(["text", "url", "pdf"] as SourceType[]).map((t) => {
                  const m = SOURCE_META[t];
                  const Icon = m.icon;
                  const active = sourceType === t;
                  return (
                    <button key={t} type="button" onClick={() => setSourceType(t)}
                      className={`h-16 rounded-xl border text-sm font-medium transition flex flex-col items-center justify-center gap-1 ${
                        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"
                      }`}>
                      <Icon className="h-4 w-4" /> {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {sourceType === "url" && (
              <div className="space-y-2">
                <Label>URL</Label>
                <div className="flex gap-2">
                  <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
                  <Button type="button" variant="outline" onClick={importFromUrl}>Importar</Button>
                </div>
              </div>
            )}

            {sourceType === "pdf" && (
              <div className="space-y-2">
                <Label>Arquivo PDF (opcional — cole o texto extraído abaixo)</Label>
                <Input type="file" accept="application/pdf,.pdf,.txt,.md"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (!title) setTitle(f.name.replace(/\.[^.]+$/, ""));
                    if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) {
                      setContent(await f.text());
                    } else {
                      toast.info("PDF anexado — cole o texto no campo abaixo.");
                    }
                  }} />
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Conteúdo {sourceType !== "url" && "*"}</Label>
                <span className="text-xs text-muted-foreground">
                  {content.length.toLocaleString("pt-BR")} chars · ~{estimateTokens(content).toLocaleString("pt-BR")} tokens
                </span>
              </div>
              <Textarea value={content} onChange={(e) => setContent(e.target.value)}
                rows={12} placeholder="Cole o conteúdo que o agente deve consultar…" />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function StatCard({ label, value, icon, tone, ring }: { label: string; value: number | string; icon: React.ReactNode; tone?: string; ring?: string }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-gradient-to-br ${tone ?? "from-white/5 to-white/[0.02]"} p-4 ring-1 ${ring ?? "ring-white/10"} backdrop-blur transition-transform hover:-translate-y-0.5`}>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-white/10 text-foreground ring-1 ring-white/10">{icon}</div>
        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
          <div className="text-xl font-bold tabular-nums">{value}</div>
        </div>
      </div>
    </div>
  );
}