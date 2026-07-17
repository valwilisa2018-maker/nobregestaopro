import { createFileRoute } from "@tanstack/react-router";
import { ScrollText, RefreshCw, Loader2, Inbox, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => ({ meta: [{ title: "Logs — Plataforma IA WhatsApp" }] }),
  component: Page,
});

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

  const load = async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase.from("logs").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(500);
    if (level !== "all") q = q.eq("level", level);
    const { data, error } = await q;
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as LogRow[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user, level]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      r.message.toLowerCase().includes(term) ||
      (r.source ?? "").toLowerCase().includes(term)
    );
  }, [rows, search]);

  const clearAll = async () => {
    if (!confirm("Limpar todos os logs? Esta ação é irreversível.")) return;
    if (!user) return;
    const { error } = await supabase.from("logs").delete().eq("user_id", user.id);
    if (error) return toast.error(error.message);
    toast.success("Logs limpos");
    load();
  };

  return (
    <PageShell
      title="Logs"
      description="Eventos técnicos gerados pela plataforma em tempo real."
      icon={<ScrollText className="h-6 w-6" />}
      status="ativo"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" onClick={load}><RefreshCw className="h-4 w-4" /> Atualizar</Button>
          <Button variant="outline" onClick={clearAll}><Trash2 className="h-4 w-4" /> Limpar</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <Input placeholder="Buscar mensagem ou origem…" value={search} onChange={(e) => setSearch(e.target.value)} className="sm:max-w-sm" />
        <Select value={level} onValueChange={setLevel}>
          <SelectTrigger className="sm:w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os níveis</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warn">Warn</SelectItem>
            <SelectItem value="error">Error</SelectItem>
            <SelectItem value="debug">Debug</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Inbox className="h-6 w-6" /></div>
              <p className="text-muted-foreground">Nenhum log encontrado.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {filtered.map((r) => (
                <LogRowItem key={r.id} r={r} />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
