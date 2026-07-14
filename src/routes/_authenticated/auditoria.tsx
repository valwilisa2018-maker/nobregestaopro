import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, XCircle, Loader2, ShieldCheck, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/auditoria")({
  component: AuditoriaPage,
});

// Espelho do menu da sidebar — mantenha em sincronia se adicionar itens lá.
const MENU_GROUPS: { label: string; items: { title: string; url: string }[] }[] = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", url: "/dashboard" },
      { title: "Vendas", url: "/sales" },
      { title: "Telão", url: "/telao" },
      { title: "Produção (Kanban)", url: "/kanban" },
      { title: "Serviços a Fazer", url: "/services-todo" },
      { title: "Pastas e Arquivos", url: "/pastas-arquivos" },
      { title: "Chat Organizador", url: "/chat-organizador" },
      { title: "Operação Metas", url: "/operacao-meta" },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Clientes", url: "/customers" },
      { title: "Vendedores", url: "/sellers" },
      { title: "Produtores", url: "/producers" },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Pagamentos Cartão/PIX", url: "/pagarme-history" },
      { title: "Gerar Pagamento", url: "/payment-link" },
      { title: "Financeiro", url: "/finance" },
      { title: "Valores Pendentes", url: "/pending-payments" },
      { title: "Notas Fiscais", url: "/invoices" },
      { title: "Comissões", url: "/commissions" },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Backup", url: "/backup" },
      { title: "Conectar WhatsApp", url: "/whatsapp" },
      { title: "Configurações", url: "/admin" },
      { title: "Auditoria", url: "/auditoria" },
    ],
  },
];

type Status = "pending" | "ok" | "fail";
type Result = { url: string; title: string; status: Status; httpStatus?: number; ms?: number; error?: string };

function AuditoriaPage() {
  const all = MENU_GROUPS.flatMap((g) => g.items);
  const [results, setResults] = useState<Record<string, Result>>(
    Object.fromEntries(all.map((i) => [i.url, { ...i, status: "pending" as Status }]))
  );
  const [running, setRunning] = useState(false);
  const [lastRun, setLastRun] = useState<string | null>(null);

  async function runAudit() {
    setRunning(true);
    setResults(Object.fromEntries(all.map((i) => [i.url, { ...i, status: "pending" as Status }])));
    for (const item of all) {
      const start = performance.now();
      try {
        const res = await fetch(item.url, { method: "GET", credentials: "include", redirect: "follow" });
        const ms = Math.round(performance.now() - start);
        setResults((prev) => ({
          ...prev,
          [item.url]: {
            ...item,
            status: res.ok ? "ok" : "fail",
            httpStatus: res.status,
            ms,
          },
        }));
      } catch (e) {
        setResults((prev) => ({
          ...prev,
          [item.url]: {
            ...item,
            status: "fail",
            error: e instanceof Error ? e.message : String(e),
            ms: Math.round(performance.now() - start),
          },
        }));
      }
    }
    setLastRun(new Date().toLocaleString("pt-BR"));
    setRunning(false);
  }

  const flat = Object.values(results);
  const okCount = flat.filter((r) => r.status === "ok").length;
  const failCount = flat.filter((r) => r.status === "fail").length;
  const pendingCount = flat.filter((r) => r.status === "pending").length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <PageHero
        eyebrow="Diagnóstico"
        icon={ShieldCheck}
        title="Auditoria do Sistema"
        description="Verifica cada menu da plataforma, faz health-check da rota correspondente e reporta status HTTP + latência."
      />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          {lastRun && (
            <p className="text-xs text-muted-foreground mt-1">Última execução: {lastRun}</p>
          )}
        </div>
        <Button onClick={runAudit} disabled={running} size="lg">
          {running ? (
            <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Auditando...</>
          ) : (
            <><RefreshCw className="w-4 h-4 mr-2" /> Rodar auditoria</>
          )}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">OK</div><div className="text-2xl font-bold text-green-600">{okCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Falhas</div><div className="text-2xl font-bold text-red-600">{failCount}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Pendentes</div><div className="text-2xl font-bold text-muted-foreground">{pendingCount}</div></CardContent></Card>
      </div>

      {MENU_GROUPS.map((group) => (
        <Card key={group.label}>
          <CardHeader><CardTitle className="text-base">{group.label}</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {group.items.map((item) => {
              const r = results[item.url];
              return (
                <div key={item.url} className="flex items-center justify-between gap-3 p-3 rounded-md border bg-card/50">
                  <div className="flex items-center gap-3 min-w-0">
                    {r.status === "ok" && <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />}
                    {r.status === "fail" && <XCircle className="w-5 h-5 text-red-600 shrink-0" />}
                    {r.status === "pending" && (running ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground shrink-0" /> : <div className="w-5 h-5 rounded-full border-2 border-dashed border-muted-foreground/40 shrink-0" />)}
                    <div className="min-w-0">
                      <div className="font-medium truncate">{item.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{item.url}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {r.httpStatus !== undefined && (
                      <Badge variant={r.status === "ok" ? "default" : "destructive"}>{r.httpStatus}</Badge>
                    )}
                    {r.ms !== undefined && (
                      <span className="text-xs text-muted-foreground tabular-nums">{r.ms}ms</span>
                    )}
                    {r.error && (
                      <span className="text-xs text-red-600 max-w-[200px] truncate" title={r.error}>{r.error}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader><CardTitle className="text-base">Auditoria de build (CLI)</CardTitle></CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>Para rodar a verificação estática de rotas localmente ou em CI:</p>
          <pre className="bg-muted p-3 rounded text-xs overflow-x-auto">bun run audit:routes</pre>
          <p>Sai com código 1 se qualquer item do menu não tiver rota correspondente — útil para bloquear deploys quebrados.</p>
        </CardContent>
      </Card>
    </div>
  );
}