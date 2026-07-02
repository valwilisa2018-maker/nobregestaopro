import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Workflow, Sparkles, Save, Trash2, Loader2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { generateFlow, saveFlow, listFlows, deleteFlow } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({ meta: [{ title: "Fluxos de Conversa com IA — Plataforma" }] }),
  component: Page,
});

type FlowNode = {
  id: string;
  name?: string;
  type: string;
  message?: string;
  options?: string[];
  variable?: string;
  condition?: string;
  next?: string;
  branches?: Record<string, string>;
};
type FlowDef = {
  name?: string;
  description?: string;
  trigger?: string;
  variables?: string[];
  nodes?: FlowNode[];
};

function renderTree(def: FlowDef): string {
  const nodes = def.nodes ?? [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const start = nodes.find((n) => n.type === "START") ?? nodes[0];
  if (!start) return "(fluxo vazio)";
  const seen = new Set<string>();
  const lines: string[] = [];
  const walk = (id: string, prefix: string, isLast: boolean) => {
    if (seen.has(id)) { lines.push(`${prefix}${isLast ? "└── " : "├── "}↺ ${id}`); return; }
    seen.add(id);
    const n = byId.get(id);
    if (!n) return;
    const label = `${n.type}${n.name ? " · " + n.name : ""}${n.message ? " — " + n.message.slice(0, 60) : ""}`;
    lines.push(`${prefix}${isLast ? "└── " : "├── "}${label}`);
    const nextPrefix = prefix + (isLast ? "    " : "│   ");
    const kids: Array<[string, string]> = [];
    if (n.branches) for (const [k, v] of Object.entries(n.branches)) kids.push([k, v]);
    if (n.next) kids.push(["", n.next]);
    kids.forEach(([k, v], i) => {
      if (k) lines.push(`${nextPrefix}├── [${k}]`);
      walk(v, nextPrefix, i === kids.length - 1);
    });
  };
  walk(start.id, "", true);
  return lines.join("\n");
}

function Page() {
  const qc = useQueryClient();
  const gen = useServerFn(generateFlow);
  const save = useServerFn(saveFlow);
  const list = useServerFn(listFlows);
  const del = useServerFn(deleteFlow);

  const [prompt, setPrompt] = useState("");
  const [flow, setFlow] = useState<FlowDef | null>(null);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");

  const flowsQ = useQuery({ queryKey: ["flows"], queryFn: () => list() });

  const genM = useMutation({
    mutationFn: async () => gen({ data: { prompt } }),
    onSuccess: (res) => {
      try {
        const parsed = JSON.parse(res.flowJson) as FlowDef;
        setFlow(parsed);
        setName(parsed.name ?? "Novo fluxo");
        setTrigger(parsed.trigger ?? "");
        toast.success("Fluxo gerado");
      } catch { toast.error("Resposta inválida da IA"); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (!flow) throw new Error("Gere um fluxo primeiro");
      return save({ data: { name, trigger, description: flow.description ?? null, definition: flow as Record<string, unknown> } });
    },
    onSuccess: () => { toast.success("Fluxo salvo"); qc.invalidateQueries({ queryKey: ["flows"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["flows"] }); },
  });

  const tree = useMemo(() => (flow ? renderTree(flow) : ""), [flow]);

  return (
    <PageShell
      title="Fluxos de Conversa"
      description="Descreva o que precisa e a IA monta o fluxo em árvore (START → nós → END) pronto para WhatsApp, Instagram, Web Chat."
      icon={<Workflow className="h-6 w-6" />}
      status="ativo"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Gerar com IA</CardTitle>
            <CardDescription>Ex.: "Fluxo para qualificar lead de imóvel, capturar nome/telefone/cidade e transferir para corretor"</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea rows={6} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Descreva o objetivo do fluxo..." />
            <Button onClick={() => genM.mutate()} disabled={!prompt.trim() || genM.isPending}>
              {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar fluxo
            </Button>

            {flow && (
              <div className="space-y-2 pt-3 border-t">
                <div className="grid grid-cols-2 gap-2">
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" />
                  <Input value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Gatilho (palavra-chave, webhook...)" />
                </div>
                <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !name.trim()} variant="secondary">
                  <Save className="h-4 w-4" /> Salvar fluxo
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Árvore do fluxo</CardTitle>
            <CardDescription>{flow?.description ?? "Nenhum fluxo carregado ainda."}</CardDescription>
          </CardHeader>
          <CardContent>
            {flow ? (
              <pre className="text-xs whitespace-pre overflow-auto rounded-md bg-muted/40 p-3 max-h-[420px]">{tree}</pre>
            ) : (
              <div className="text-sm text-muted-foreground">Gere um fluxo à esquerda para ver a árvore.</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">Meus fluxos</h2>
        {flowsQ.isLoading ? (
          <div className="text-sm text-muted-foreground">Carregando...</div>
        ) : flowsQ.data?.flows.length ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {flowsQ.data.flows.map((f) => (
              <Card key={f.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between text-base">
                    <span className="truncate">{f.name}</span>
                    {f.is_active && <Badge variant="secondary">ativo</Badge>}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">{f.description ?? f.trigger ?? "—"}</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => {
                    const def = (f.definition ?? {}) as FlowDef;
                    setFlow(def); setName(f.name); setTrigger(f.trigger ?? "");
                  }}>Abrir</Button>
                  <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => delM.mutate(f.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">Nenhum fluxo salvo ainda.</div>
        )}
      </div>
    </PageShell>
  );
}
