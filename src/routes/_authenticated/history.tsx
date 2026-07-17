import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileText,
  History as HistoryIcon,
  Image as ImageIcon,
  Mic,
  Paperclip,
  RefreshCw,
  Search,
  Video as VideoIcon,
} from "lucide-react";
import { PageShell } from "@/components/page-shell";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/history")({
  head: () => ({ meta: [{ title: "Histórico — Plataforma IA WhatsApp" }] }),
  component: Page,
});

type MsgRow = {
  id: string;
  direction: "inbound" | "outbound";
  type: "text" | "image" | "audio" | "video" | "document";
  content: string | null;
  media_url: string | null;
  created_at: string;
  conversation_id: string | null;
};

const TYPE_META: Record<MsgRow["type"], { label: string; icon: any; tone: string }> = {
  text: { label: "Texto", icon: FileText, tone: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  image: { label: "Imagem", icon: ImageIcon, tone: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  audio: { label: "Áudio", icon: Mic, tone: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  video: { label: "Vídeo", icon: VideoIcon, tone: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  document: { label: "Documento", icon: Paperclip, tone: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

function fmtDate(iso: string) {
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return iso;
  }
}

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<MsgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [dir, setDir] = useState<"all" | "inbound" | "outbound">("all");
  const [typeF, setTypeF] = useState<"all" | MsgRow["type"]>("all");
  const [range, setRange] = useState<"24h" | "7d" | "30d" | "all">("7d");

  const load = async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      let query = supabase
        .from("messages")
        .select("id,direction,type,content,media_url,created_at,conversation_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(500);

      if (range !== "all") {
        const hours = range === "24h" ? 24 : range === "7d" ? 24 * 7 : 24 * 30;
        const since = new Date(Date.now() - hours * 3600 * 1000).toISOString();
        query = query.gte("created_at", since);
      }

      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []) as MsgRow[]);
    } catch (e: any) {
      toast.error("Erro ao carregar histórico: " + (e?.message ?? "desconhecido"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, range]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (dir !== "all" && r.direction !== dir) return false;
      if (typeF !== "all" && r.type !== typeF) return false;
      if (needle && !(r.content ?? "").toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, q, dir, typeF]);

  const kpis = useMemo(() => {
    const total = rows.length;
    const inbound = rows.filter((r) => r.direction === "inbound").length;
    const outbound = rows.filter((r) => r.direction === "outbound").length;
    const media = rows.filter((r) => r.type !== "text").length;
    return { total, inbound, outbound, media };
  }, [rows]);

  const exportCsv = () => {
    const header = ["created_at", "direction", "type", "content", "media_url"];
    const csv = [
      header.join(","),
      ...filtered.map((r) =>
        [r.created_at, r.direction, r.type, JSON.stringify(r.content ?? ""), r.media_url ?? ""].join(","),
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `historico-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <PageShell>
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-slate-900/70 to-slate-950/90 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-violet-500/15 blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-500 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.7)] ring-1 ring-white/20">
              <HistoryIcon className="h-7 w-7 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-blue-300 via-cyan-200 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Histórico
                </h1>
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-300">Ao vivo</Badge>
              </div>
              <p className="text-sm text-muted-foreground">Todas as mensagens registradas em uma linha do tempo unificada.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={load} className="border-white/10 bg-white/5 backdrop-blur hover:bg-white/10">
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={exportCsv} className="bg-gradient-to-br from-blue-500 to-violet-500 text-white hover:opacity-90">
              <Download className="mr-2 h-4 w-4" />
              Exportar CSV
            </Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total", value: kpis.total, tone: "from-blue-500/25 to-cyan-500/10", ring: "ring-blue-500/30" },
            { label: "Recebidas", value: kpis.inbound, tone: "from-emerald-500/25 to-teal-500/10", ring: "ring-emerald-500/30" },
            { label: "Enviadas", value: kpis.outbound, tone: "from-violet-500/25 to-fuchsia-500/10", ring: "ring-violet-500/30" },
            { label: "Mídia", value: kpis.media, tone: "from-amber-500/25 to-orange-500/10", ring: "ring-amber-500/30" },
          ].map((k) => (
            <div key={k.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${k.tone} p-4 ring-1 ${k.ring} backdrop-blur`}>
              <div className="text-xs uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-foreground">{k.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-white/10 bg-card/60 p-4 backdrop-blur-xl">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar no conteúdo..."
              className="h-10 border-white/10 bg-background/60 pl-9"
            />
          </div>
          <Tabs value={dir} onValueChange={(v) => setDir(v as any)}>
            <TabsList className="h-10 rounded-xl border border-white/10 bg-background/60 p-1">
              <TabsTrigger value="all" className="rounded-lg data-[state=active]:bg-white/10">Todas</TabsTrigger>
              <TabsTrigger value="inbound" className="gap-1 rounded-lg data-[state=active]:bg-emerald-500/20 data-[state=active]:text-emerald-300"><ArrowDownLeft className="h-3.5 w-3.5" />Recebidas</TabsTrigger>
              <TabsTrigger value="outbound" className="gap-1 rounded-lg data-[state=active]:bg-violet-500/20 data-[state=active]:text-violet-300"><ArrowUpRight className="h-3.5 w-3.5" />Enviadas</TabsTrigger>
            </TabsList>
          </Tabs>
          <Select value={typeF} onValueChange={(v) => setTypeF(v as any)}>
            <SelectTrigger className="h-10 w-[160px] border-white/10 bg-background/60">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="text">Texto</SelectItem>
              <SelectItem value="image">Imagem</SelectItem>
              <SelectItem value="audio">Áudio</SelectItem>
              <SelectItem value="video">Vídeo</SelectItem>
              <SelectItem value="document">Documento</SelectItem>
            </SelectContent>
          </Select>
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="h-10 w-[160px] border-white/10 bg-background/60">
              <SelectValue placeholder="Período" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">Últimas 24h</SelectItem>
              <SelectItem value="7d">Últimos 7 dias</SelectItem>
              <SelectItem value="30d">Últimos 30 dias</SelectItem>
              <SelectItem value="all">Tudo</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Timeline */}
      <div className="rounded-3xl border border-white/10 bg-gradient-to-b from-card/60 to-card/30 p-2 backdrop-blur-xl">
        {loading ? (
          <div className="grid gap-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-2xl bg-white/5" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center">
            <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/5 ring-1 ring-white/10">
              <HistoryIcon className="h-7 w-7 text-muted-foreground" />
            </div>
            <div className="text-lg font-medium">Nenhuma mensagem encontrada</div>
            <p className="text-sm text-muted-foreground">Ajuste os filtros ou o período para ver mais registros.</p>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((r) => {
              const meta = TYPE_META[r.type] ?? TYPE_META.text;
              const Icon = meta.icon;
              const isIn = r.direction === "inbound";
              return (
                <div key={r.id} className="group grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-2xl p-4 transition-colors hover:bg-white/[0.03]">
                  <div className="flex flex-col items-center gap-1 pt-1">
                    <div className={`grid h-9 w-9 place-items-center rounded-xl ring-1 ${isIn ? "bg-emerald-500/15 text-emerald-300 ring-emerald-500/30" : "bg-violet-500/15 text-violet-300 ring-violet-500/30"}`}>
                      {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="h-full w-px bg-gradient-to-b from-white/10 to-transparent" />
                  </div>
                  <div className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={`gap-1 rounded-full border ${meta.tone}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className={`rounded-full ${isIn ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" : "border-violet-500/30 bg-violet-500/10 text-violet-300"}`}>
                        {isIn ? "Recebida" : "Enviada"}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{fmtDate(r.created_at)}</span>
                    </div>
                    <div className="whitespace-pre-wrap break-words text-sm text-foreground/90">
                      {r.content?.trim() ? r.content : <span className="italic text-muted-foreground">— sem conteúdo textual —</span>}
                    </div>
                    {r.media_url && (
                      <a href={r.media_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-blue-300 hover:underline">
                        <Paperclip className="h-3 w-3" /> Abrir mídia
                      </a>
                    )}
                  </div>
                  <div className="hidden shrink-0 text-right text-[10px] uppercase tracking-wider text-muted-foreground md:block">
                    #{r.id.slice(0, 6)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PageShell>
  );
}
