import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, RefreshCw, Loader2, Inbox, Trash2, Search, Activity, AlertTriangle, Info, Bug, XCircle, Download, Filter, CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Plataforma IA WhatsApp" }] }),
  component: Page,
});

function LogRowItem({ r }: { r: LogRow }) {
  const { title, detail } = translateMessage(r.message);
  const sourceLabel = translateSource(r.source);
  const levelLabel = LEVEL_LABELS[r.level] ?? r.level;
  return (
    <div className="px-4 py-3 flex items-start gap-3 text-sm hover:bg-muted/30">
      <Badge variant="outline" className={`shrink-0 ${LEVEL_STYLES[r.level] ?? ""}`}>{levelLabel}</Badge>
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{new Date(r.created_at).toLocaleString("pt-BR")}</span>
          <span>· {sourceLabel}</span>
        </div>
        <div className="text-foreground font-medium break-words">{title}</div>
        <div className="text-muted-foreground text-xs mt-0.5 break-words">{detail}</div>
        <details className="mt-1">
          <summary className="text-xs text-muted-foreground cursor-pointer">Ver detalhes técnicos</summary>
          <div className="mt-1 space-y-1">
            <div className="text-[11px] text-muted-foreground">
              <span className="font-semibold">Código original:</span> <span className="font-mono">{r.message}</span>
            </div>
            {r.source && (
              <div className="text-[11px] text-muted-foreground">
                <span className="font-semibold">Origem:</span> <span className="font-mono">{r.source}</span>
              </div>
            )}
            {r.metadata && Object.keys(r.metadata).length > 0 && (
              <pre className="rounded bg-muted/50 p-2 text-xs overflow-x-auto"><code>{JSON.stringify(r.metadata, null, 2)}</code></pre>
            )}
          </div>
        </details>
      </div>
    </div>
  );
}

type LogRow = {
  id: string; level: string; source: string | null; message: string;
  metadata: Record<string, unknown> | null; created_at: string;
};

const LEVEL_STYLES: Record<string, string> = {
  error: "bg-destructive/15 text-destructive border-destructive/30",
  warn: "bg-yellow-500/15 text-yellow-500 border-yellow-500/30",
  info: "bg-primary/15 text-primary border-primary/30",
  debug: "bg-muted text-muted-foreground border-border",
};

const LEVEL_LABELS: Record<string, string> = {
  error: "Erro",
  warn: "Aviso",
  info: "Informação",
  debug: "Depuração",
};

// Traduz códigos técnicos comuns em descrições humanas em português.
function translateMessage(msg: string): { title: string; detail: string } {
  const m = (msg || "").trim();
  const low = m.toLowerCase();
  const map: Array<{ match: RegExp; title: string; detail: string }> = [
    { match: /^connection\.update/, title: "Atualização de conexão do WhatsApp", detail: "O status da conexão da instância foi atualizado (conectando, conectado ou desconectado)." },
    { match: /^qrcode\.updated/, title: "Novo QR Code gerado", detail: "Um novo QR Code foi gerado para parear o WhatsApp com a instância." },
    { match: /^messages\.upsert/, title: "Nova mensagem recebida", detail: "Uma nova mensagem chegou pelo WhatsApp e foi registrada na conversa." },
    { match: /^messages\.update/, title: "Mensagem atualizada", detail: "O status de uma mensagem mudou (entregue, lida ou editada)." },
    { match: /^messages\.delete/, title: "Mensagem apagada", detail: "Uma mensagem foi removida da conversa no WhatsApp." },
    { match: /^presence\.update/, title: "Presença do contato", detail: "O contato mudou o status (digitando, gravando áudio ou online)." },
    { match: /^contacts\.(upsert|update)/, title: "Contato sincronizado", detail: "As informações de um contato do WhatsApp foram criadas ou atualizadas." },
    { match: /^chats\.(upsert|update)/, title: "Conversa sincronizada", detail: "Os dados de uma conversa foram criados ou atualizados." },
    { match: /^send\b|message.?sent|enviad/, title: "Mensagem enviada", detail: "Uma mensagem foi enviada com sucesso pelo WhatsApp." },
    { match: /apikey matched: secret/, title: "Webhook autenticado (chave secreta)", detail: "O webhook recebido foi validado com a chave secreta da instância." },
    { match: /apikey matched: global/, title: "Webhook autenticado (chave global)", detail: "O webhook recebido foi validado com a chave global do sistema." },
    { match: /apikey (mismatch|invalid|not match)/, title: "Chave de API inválida", detail: "Um webhook foi recebido com chave incorreta e foi rejeitado." },
    { match: /unauthorized|401/, title: "Acesso não autorizado", detail: "Uma requisição foi bloqueada por falta de autenticação válida." },
    { match: /forbidden|403/, title: "Acesso proibido", detail: "A operação foi bloqueada por falta de permissão." },
    { match: /not.?found|404/, title: "Recurso não encontrado", detail: "O item solicitado não foi encontrado no servidor." },
    { match: /rate.?limit|429/, title: "Limite de requisições atingido", detail: "Muitas requisições em pouco tempo — aguarde alguns segundos e tente novamente." },
    { match: /timeout/, title: "Tempo esgotado", detail: "A operação demorou demais para responder e foi cancelada." },
    { match: /webhook/, title: "Evento de webhook recebido", detail: "Um evento externo foi recebido e processado pela plataforma." },
    { match: /flow/, title: "Fluxo de automação executado", detail: "Um passo de um fluxo de automação foi executado." },
    { match: /sequence|sequência/, title: "Sequência de mensagens", detail: "Um passo de uma sequência de mensagens foi disparado." },
    { match: /broadcast|disparo/, title: "Disparo em massa", detail: "Um envio em massa foi processado." },
    { match: /follow.?up/, title: "Follow-up automático", detail: "Uma mensagem de follow-up foi enviada automaticamente." },
    { match: /credit/, title: "Movimentação de créditos", detail: "Houve consumo ou adição de créditos na sua conta." },
    { match: /login|sign.?in|auth/, title: "Autenticação de usuário", detail: "Uma tentativa de login ou autenticação foi registrada." },
  ];
  for (const r of map) if (r.match.test(low)) return { title: r.title, detail: r.detail };
  return { title: m || "Evento", detail: "Evento técnico registrado pela plataforma." };
}

function translateSource(src: string | null): string {
  if (!src) return "Sistema";
  const s = src.toLowerCase();
  if (s.startsWith("evolution:")) return `WhatsApp · ${src.split(":")[1] ?? ""}`;
  if (s === "evolution.webhook") return "Webhook do WhatsApp";
  if (s.includes("meta")) return "API oficial da Meta";
  if (s.includes("flow")) return "Fluxos de automação";
  if (s.includes("sequence")) return "Sequências de mensagens";
  if (s.includes("broadcast")) return "Disparos em massa";
  if (s.includes("followup")) return "Follow-ups";
  if (s.includes("auth")) return "Autenticação";
  if (s.includes("credit")) return "Créditos";
  if (s.includes("ai") || s.includes("agent")) return "Agente de IA";
  return src;
}

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [clearState, setClearState] = useState<{
    status: "idle" | "running" | "done" | "error";
    processed: number;
    total: number;
    message?: string;
  }>({ status: "idle", processed: 0, total: 0 });

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as LogRow[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (level !== "all" && r.level !== level) return false;
      if (!term) return true;
      return r.message.toLowerCase().includes(term) || (r.source ?? "").toLowerCase().includes(term);
    });
  }, [rows, search, level]);

  const counts = useMemo(() => ({
    all: rows.length,
    error: rows.filter((r) => r.level === "error").length,
    warn: rows.filter((r) => r.level === "warn").length,
    info: rows.filter((r) => r.level === "info").length,
    debug: rows.filter((r) => r.level === "debug").length,
  }), [rows]);

  const clearAll = async () => {
    if (!confirm("Limpar todos os logs? Esta ação é irreversível.")) return;
    if (!user) return;
    // Conta o total antes para calcular o progresso.
    const { count: totalCount, error: countErr } = await supabase
      .from("logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countErr) {
      setClearState({ status: "error", processed: 0, total: 0, message: countErr.message });
      toast.error(countErr.message);
      return;
    }
    const total = totalCount ?? 0;
    if (total === 0) {
      setClearState({ status: "done", processed: 0, total: 0, message: "Nada para limpar" });
      toast.info("Não há logs para limpar");
      return;
    }
    setClearState({ status: "running", processed: 0, total, message: "Iniciando limpeza…" });
    const t = toast.loading("Limpando logs…");
    try {
      let processed = 0;
      // Apaga em lotes para evitar timeout do banco em volumes altos.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: batch, error: selErr } = await supabase
          .from("logs")
          .select("id")
          .eq("user_id", user.id)
          .limit(500);
        if (selErr) throw selErr;
        if (!batch || batch.length === 0) break;
        const ids = batch.map((r) => r.id);
        const { error: delErr } = await supabase.from("logs").delete().in("id", ids);
        if (delErr) throw delErr;
        processed += ids.length;
        setClearState({ status: "running", processed, total, message: `Removendo em lote (${ids.length})…` });
        toast.loading(`Limpando logs… ${processed}/${total}`, { id: t });
        if (batch.length < 500) break;
      }
      setClearState({ status: "done", processed, total, message: "Limpeza concluída" });
      toast.success(`Logs limpos (${processed})`, { id: t });
      setRows([]);
      load();
    } catch (e: any) {
      const msg = e?.message ?? "Falha ao limpar logs";
      setClearState((s) => ({ status: "error", processed: s.processed, total: s.total, message: msg }));
      toast.error(msg, { id: t });
    }
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(filtered, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `logs-${new Date().toISOString().slice(0,10)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const levelChips: Array<{ id: string; label: string; icon: React.ReactNode; count: number; tone: string }> = [
    { id: "all", label: "Todos", icon: <Activity className="h-3.5 w-3.5" />, count: counts.all, tone: "primary" },
    { id: "error", label: "Erros", icon: <XCircle className="h-3.5 w-3.5" />, count: counts.error, tone: "destructive" },
    { id: "warn", label: "Avisos", icon: <AlertTriangle className="h-3.5 w-3.5" />, count: counts.warn, tone: "warn" },
    { id: "info", label: "Informações", icon: <Info className="h-3.5 w-3.5" />, count: counts.info, tone: "primary" },
    { id: "debug", label: "Depuração", icon: <Bug className="h-3.5 w-3.5" />, count: counts.debug, tone: "muted" },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-accent/20 p-6 sm:p-8">
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-primary/40">
              <ScrollText className="h-7 w-7" />
            </div>
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
                  Central de Logs
                </h1>
                <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30 gap-1">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-75 animate-ping" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
                  </span>
                  Ao vivo
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground max-w-2xl">
                Monitoramento em tempo real de todos os eventos técnicos da plataforma. Filtre, busque e exporte para análise.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={exportJson} className="gap-2"><Download className="h-4 w-4" />Exportar</Button>
            <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />Atualizar</Button>
            <Button variant="outline" onClick={clearAll} className="gap-2 text-destructive hover:text-destructive"><Trash2 className="h-4 w-4" />Limpar</Button>
          </div>
        </div>

        {/* KPIs */}
        <div className="relative mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
          {levelChips.map((c) => {
            const active = level === c.id;
            const toneCls =
              c.tone === "destructive" ? "from-destructive/20 to-destructive/5 text-destructive" :
              c.tone === "warn" ? "from-yellow-500/20 to-yellow-500/5 text-yellow-500" :
              c.tone === "muted" ? "from-muted-foreground/20 to-muted-foreground/5 text-muted-foreground" :
              "from-primary/20 to-primary/5 text-primary";
            return (
              <button
                key={c.id}
                onClick={() => setLevel(c.id)}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border p-4 text-left transition-all",
                  "bg-gradient-to-br", toneCls,
                  active ? "border-primary/50 ring-2 ring-primary/30 scale-[1.02]" : "border-border hover:border-primary/30 hover:scale-[1.01]",
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider opacity-80">
                    {c.icon}
                    {c.label}
                  </div>
                </div>
                <div className="mt-2 text-3xl font-bold text-foreground tabular-nums">{c.count}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Search bar */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por mensagem ou origem…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-11 pl-10 border-0 bg-muted/40 focus-visible:ring-1 focus-visible:ring-primary/40"
            />
          </div>
          <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            <span className="tabular-nums">{filtered.length} de {rows.length} registros</span>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="rounded-2xl border border-border bg-card overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Carregando eventos…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center space-y-3">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <Inbox className="h-7 w-7" />
            </div>
            <div>
              <p className="font-medium text-foreground">Nenhum log encontrado</p>
              <p className="text-sm text-muted-foreground">Ajuste os filtros ou aguarde novos eventos.</p>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((r) => (
              <LogRowItem key={r.id} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
