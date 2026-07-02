import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useEffect } from "react";
import {
  Workflow, Sparkles, Save, Trash2, Loader2, Plus, MessageSquare, GitBranch,
  Image as ImageIcon, Video, Music, HelpCircle, Play, Square, Webhook, Clock, User,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useEdgesState,
  useNodesState, Handle, Position, type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { generateFlow, saveFlow, listFlows, deleteFlow } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({ meta: [{ title: "Fluxos de Conversa com IA — Plataforma" }] }),
  component: Page,
});

type NodeKind =
  | "START" | "MESSAGE" | "CONDITION" | "YESNO" | "IMAGE" | "VIDEO" | "AUDIO"
  | "QUESTION" | "WAIT" | "WEBHOOK" | "HANDOFF" | "END";

type BlockData = {
  label: string;
  kind: NodeKind;
  text?: string;
  url?: string;
  condition?: string;
  variable?: string;
  seconds?: number;
};

const KIND_META: Record<NodeKind, { label: string; icon: React.ReactNode; color: string; outputs: string[] }> = {
  START:     { label: "Início",       icon: <Play className="h-3.5 w-3.5" />,         color: "bg-emerald-500", outputs: ["out"] },
  MESSAGE:   { label: "Mensagem",     icon: <MessageSquare className="h-3.5 w-3.5" />, color: "bg-blue-500",    outputs: ["out"] },
  QUESTION:  { label: "Pergunta",     icon: <HelpCircle className="h-3.5 w-3.5" />,   color: "bg-indigo-500",  outputs: ["out"] },
  CONDITION: { label: "Condição",     icon: <GitBranch className="h-3.5 w-3.5" />,    color: "bg-amber-500",   outputs: ["true", "false"] },
  YESNO:     { label: "Sim / Não",    icon: <GitBranch className="h-3.5 w-3.5" />,    color: "bg-orange-500",  outputs: ["sim", "não"] },
  IMAGE:     { label: "Imagem",       icon: <ImageIcon className="h-3.5 w-3.5" />,    color: "bg-pink-500",    outputs: ["out"] },
  VIDEO:     { label: "Vídeo",        icon: <Video className="h-3.5 w-3.5" />,        color: "bg-rose-500",    outputs: ["out"] },
  AUDIO:     { label: "Áudio",        icon: <Music className="h-3.5 w-3.5" />,        color: "bg-purple-500",  outputs: ["out"] },
  WAIT:      { label: "Aguardar",     icon: <Clock className="h-3.5 w-3.5" />,        color: "bg-slate-500",   outputs: ["out"] },
  WEBHOOK:   { label: "Webhook",      icon: <Webhook className="h-3.5 w-3.5" />,      color: "bg-cyan-600",    outputs: ["out"] },
  HANDOFF:   { label: "Atendente",    icon: <User className="h-3.5 w-3.5" />,         color: "bg-fuchsia-600", outputs: ["out"] },
  END:       { label: "Fim",          icon: <Square className="h-3.5 w-3.5" />,       color: "bg-neutral-700", outputs: [] },
};

function BlockNode({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const meta = KIND_META[d.kind];
  const preview = d.text || d.url || d.condition || "";
  return (
    <div className={`rounded-lg border bg-card shadow-sm min-w-[180px] ${selected ? "ring-2 ring-primary" : ""}`}>
      {d.kind !== "START" && <Handle type="target" position={Position.Left} />}
      <div className={`flex items-center gap-2 px-3 py-1.5 text-white text-xs font-medium rounded-t-lg ${meta.color}`}>
        {meta.icon}<span>{meta.label}</span>
      </div>
      <div className="px-3 py-2 text-xs text-foreground/80 min-h-[32px]">
        {preview ? <div className="line-clamp-2">{preview}</div> : <div className="italic text-muted-foreground">clique para editar</div>}
      </div>
      {meta.outputs.length === 1 && <Handle type="source" position={Position.Right} id={meta.outputs[0]} />}
      {meta.outputs.length > 1 && meta.outputs.map((o, i) => (
        <div key={o} className="relative">
          <div className="text-[10px] text-muted-foreground px-3 py-0.5 text-right pr-6">{o}</div>
          <Handle
            type="source" position={Position.Right} id={o}
            style={{ top: `${100 - (meta.outputs.length - i) * 18}%` }}
          />
        </div>
      ))}
    </div>
  );
}

const nodeTypes = { block: BlockNode };

function makeNode(kind: NodeKind, pos: { x: number; y: number }): Node<BlockData> {
  return {
    id: `${kind}_${Math.random().toString(36).slice(2, 9)}`,
    type: "block",
    position: pos,
    data: { kind, label: KIND_META[kind].label },
  };
}

const TEMPLATES: Array<{ name: string; nodes: Node<BlockData>[]; edges: Edge[] }> = [
  {
    name: "Boas-vindas + Menu",
    nodes: [
      { id: "s", type: "block", position: { x: 40, y: 120 }, data: { kind: "START", label: "Início" } },
      { id: "m", type: "block", position: { x: 260, y: 120 }, data: { kind: "MESSAGE", label: "Mensagem", text: "Olá! Bem-vindo 👋" } },
      { id: "q", type: "block", position: { x: 500, y: 120 }, data: { kind: "YESNO", label: "Sim/Não", text: "Quer falar com atendente?" } },
      { id: "h", type: "block", position: { x: 760, y: 40 }, data: { kind: "HANDOFF", label: "Atendente" } },
      { id: "e", type: "block", position: { x: 760, y: 220 }, data: { kind: "END", label: "Fim" } },
    ],
    edges: [
      { id: "e1", source: "s", target: "m" },
      { id: "e2", source: "m", target: "q" },
      { id: "e3", source: "q", sourceHandle: "sim", target: "h" },
      { id: "e4", source: "q", sourceHandle: "não", target: "e" },
    ],
  },
  {
    name: "Qualificação de lead",
    nodes: [
      { id: "s", type: "block", position: { x: 40, y: 120 }, data: { kind: "START", label: "Início" } },
      { id: "n", type: "block", position: { x: 240, y: 120 }, data: { kind: "QUESTION", label: "Pergunta", text: "Qual seu nome?", variable: "nome" } },
      { id: "c", type: "block", position: { x: 460, y: 120 }, data: { kind: "QUESTION", label: "Pergunta", text: "Cidade?", variable: "cidade" } },
      { id: "w", type: "block", position: { x: 680, y: 120 }, data: { kind: "WEBHOOK", label: "Webhook", url: "https://exemplo.com/lead" } },
      { id: "e", type: "block", position: { x: 900, y: 120 }, data: { kind: "END", label: "Fim" } },
    ],
    edges: [
      { id: "e1", source: "s", target: "n" }, { id: "e2", source: "n", target: "c" },
      { id: "e3", source: "c", target: "w" }, { id: "e4", source: "w", target: "e" },
    ],
  },
];

function Page() {
  return (
    <PageShell
      title="Fluxos de Conversa"
      description="Arraste blocos, conecte-os e monte seu fluxo. Salve e dispare quando quiser."
      icon={<Workflow className="h-6 w-6" />}
      status="ativo"
    >
      <ReactFlowProvider>
        <Builder />
      </ReactFlowProvider>
    </PageShell>
  );
}

function Builder() {
  const qc = useQueryClient();
  const save = useServerFn(saveFlow);
  const list = useServerFn(listFlows);
  const del = useServerFn(deleteFlow);
  const gen = useServerFn(generateFlow);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<BlockData>>([
    { id: "start", type: "block", position: { x: 80, y: 160 }, data: { kind: "START", label: "Início" } },
  ]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selected, setSelected] = useState<Node<BlockData> | null>(null);
  const [flowId, setFlowId] = useState<string | null>(null);
  const [name, setName] = useState("Novo fluxo");
  const [trigger, setTrigger] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiOpen, setAiOpen] = useState(false);

  const flowsQ = useQuery({ queryKey: ["flows"], queryFn: () => list() });

  const onConnect = useCallback(
    (c: Connection) => setEdges((eds) => addEdge({ ...c, animated: true }, eds)),
    [setEdges],
  );

  const addBlock = (kind: NodeKind) => {
    const pos = { x: 200 + Math.random() * 300, y: 100 + Math.random() * 250 };
    setNodes((n) => [...n, makeNode(kind, pos)]);
  };

  const loadTemplate = (t: typeof TEMPLATES[number]) => {
    setNodes(t.nodes.map((n) => ({ ...n })));
    setEdges(t.edges.map((e) => ({ ...e, animated: true })));
    setFlowId(null); setName(t.name);
    toast.success(`Modelo carregado: ${t.name}`);
  };

  const updateSelected = (patch: Partial<BlockData>) => {
    if (!selected) return;
    setNodes((ns) => ns.map((n) => n.id === selected.id ? { ...n, data: { ...n.data, ...patch } } : n));
    setSelected((s) => s ? { ...s, data: { ...s.data, ...patch } } : s);
  };

  const removeSelected = () => {
    if (!selected) return;
    setNodes((ns) => ns.filter((n) => n.id !== selected.id));
    setEdges((es) => es.filter((e) => e.source !== selected.id && e.target !== selected.id));
    setSelected(null);
  };

  const saveM = useMutation({
    mutationFn: async () => save({ data: {
      id: flowId, name, trigger,
      description: null,
      definition: { nodes, edges } as unknown as Record<string, unknown>,
    } }),
    onSuccess: (res) => { setFlowId(res.id); toast.success("Fluxo salvo"); qc.invalidateQueries({ queryKey: ["flows"] }); },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Excluído"); qc.invalidateQueries({ queryKey: ["flows"] }); if (!flowId) return; },
  });

  const openFlow = (f: { id: string; name: string; trigger: string | null; definition: unknown }) => {
    const def = (f.definition ?? {}) as { nodes?: Node<BlockData>[]; edges?: Edge[] };
    setNodes(def.nodes ?? []); setEdges(def.edges ?? []);
    setFlowId(f.id); setName(f.name); setTrigger(f.trigger ?? ""); setSelected(null);
  };

  const genM = useMutation({
    mutationFn: async () => gen({ data: { prompt: aiPrompt } }),
    onSuccess: (res) => {
      try {
        const parsed = JSON.parse(res.flowJson) as { nodes?: Array<{ id: string; type: string; message?: string; next?: string; branches?: Record<string, string>; name?: string }> };
        const src = parsed.nodes ?? [];
        const kindMap: Record<string, NodeKind> = {
          START: "START", END: "END", MESSAGE: "MESSAGE", QUESTION: "QUESTION",
          IF: "CONDITION", SWITCH: "CONDITION", BUTTONS: "YESNO", LIST: "YESNO",
          IMAGE: "IMAGE", VIDEO: "VIDEO", AUDIO: "AUDIO", WAIT: "WAIT",
          WEBHOOK: "WEBHOOK", HTTP: "WEBHOOK", HANDOFF: "HANDOFF",
        };
        const newNodes: Node<BlockData>[] = src.map((n, i) => ({
          id: n.id, type: "block",
          position: { x: 60 + (i % 4) * 240, y: 60 + Math.floor(i / 4) * 180 },
          data: { kind: kindMap[n.type] ?? "MESSAGE", label: n.name ?? n.type, text: n.message },
        }));
        const newEdges: Edge[] = [];
        for (const n of src) {
          if (n.next) newEdges.push({ id: `${n.id}-${n.next}`, source: n.id, target: n.next, animated: true });
          if (n.branches) for (const [k, v] of Object.entries(n.branches)) {
            newEdges.push({ id: `${n.id}-${k}-${v}`, source: n.id, target: v, label: k, animated: true });
          }
        }
        setNodes(newNodes); setEdges(newEdges); setFlowId(null); setAiOpen(false);
        toast.success("Fluxo gerado pela IA");
      } catch { toast.error("Resposta inválida da IA"); }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !(e.target as HTMLElement)?.closest("input,textarea")) {
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected]);

  const kinds = useMemo(() => Object.keys(KIND_META) as NodeKind[], []);

  return (
    <div className="flex flex-col gap-4">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Input className="max-w-[240px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fluxo" />
        <Input className="max-w-[240px]" value={trigger} onChange={(e) => setTrigger(e.target.value)} placeholder="Gatilho (opcional)" />
        <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
          {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar
        </Button>
        <Dialog open={aiOpen} onOpenChange={setAiOpen}>
          <DialogTrigger asChild>
            <Button variant="secondary"><Sparkles className="h-4 w-4" /> Gerar com IA</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Gerar fluxo com IA</DialogTitle></DialogHeader>
            <Textarea rows={5} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Ex.: Qualifica lead de imóvel, pede nome/cidade e envia para o corretor" />
            <Button onClick={() => genM.mutate()} disabled={!aiPrompt.trim() || genM.isPending}>
              {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Gerar
            </Button>
          </DialogContent>
        </Dialog>
        <div className="ml-auto flex flex-wrap gap-1">
          {TEMPLATES.map((t) => (
            <Button key={t.name} size="sm" variant="outline" onClick={() => loadTemplate(t)}>{t.name}</Button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[200px_1fr_280px]">
        {/* Palette */}
        <Card className="lg:sticky lg:top-4 h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Blocos</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {kinds.map((k) => {
              const m = KIND_META[k];
              return (
                <Button key={k} size="sm" variant="ghost" className="justify-start gap-2" onClick={() => addBlock(k)}>
                  <span className={`h-5 w-5 rounded flex items-center justify-center text-white ${m.color}`}>{m.icon}</span>
                  <span className="text-xs">{m.label}</span>
                  <Plus className="h-3 w-3 ml-auto opacity-50" />
                </Button>
              );
            })}
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="h-[600px] rounded-lg border bg-background overflow-hidden">
          <ReactFlow
            nodes={nodes} edges={edges}
            onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={(_, n) => setSelected(n as Node<BlockData>)}
            onPaneClick={() => setSelected(null)}
            fitView
          >
            <Background />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <Card className="h-fit">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Propriedades</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!selected ? (
              <p className="text-xs text-muted-foreground">Clique em um bloco para editar.</p>
            ) : (
              <>
                <Badge>{KIND_META[selected.data.kind].label}</Badge>
                <div className="space-y-1">
                  <Label className="text-xs">Rótulo</Label>
                  <Input value={selected.data.label} onChange={(e) => updateSelected({ label: e.target.value })} />
                </div>
                {["MESSAGE","QUESTION","YESNO","IMAGE","VIDEO","AUDIO","HANDOFF"].includes(selected.data.kind) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Texto</Label>
                    <Textarea rows={3} value={selected.data.text ?? ""} onChange={(e) => updateSelected({ text: e.target.value })} />
                  </div>
                )}
                {["IMAGE","VIDEO","AUDIO","WEBHOOK"].includes(selected.data.kind) && (
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input value={selected.data.url ?? ""} onChange={(e) => updateSelected({ url: e.target.value })} placeholder="https://..." />
                  </div>
                )}
                {selected.data.kind === "CONDITION" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Condição</Label>
                    <Input value={selected.data.condition ?? ""} onChange={(e) => updateSelected({ condition: e.target.value })} placeholder="ex.: {{cidade}} == 'SP'" />
                  </div>
                )}
                {selected.data.kind === "QUESTION" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Salvar em variável</Label>
                    <Input value={selected.data.variable ?? ""} onChange={(e) => updateSelected({ variable: e.target.value })} placeholder="nome" />
                  </div>
                )}
                {selected.data.kind === "WAIT" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Segundos</Label>
                    <Input type="number" value={selected.data.seconds ?? 0} onChange={(e) => updateSelected({ seconds: Number(e.target.value) })} />
                  </div>
                )}
                <Button size="sm" variant="destructive" onClick={removeSelected} className="w-full">
                  <Trash2 className="h-4 w-4" /> Excluir bloco
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Saved flows */}
      <div className="mt-2">
        <h2 className="text-sm font-semibold mb-2 text-muted-foreground">Meus fluxos salvos</h2>
        {flowsQ.isLoading ? (
          <div className="text-xs text-muted-foreground">Carregando...</div>
        ) : flowsQ.data?.flows?.length ? (
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
            {flowsQ.data.flows.map((f) => (
              <Card key={f.id} className={flowId === f.id ? "ring-2 ring-primary" : ""}>
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between text-sm">
                    <span className="truncate">{f.name}</span>
                    {f.is_active && <Badge variant="secondary">ativo</Badge>}
                  </CardTitle>
                  <CardDescription className="line-clamp-1 text-xs">{f.trigger ?? "sem gatilho"}</CardDescription>
                </CardHeader>
                <CardContent className="flex gap-1">
                  <Button size="sm" variant="outline" onClick={() => openFlow(f)}>Abrir</Button>
                  <Button size="sm" variant="ghost" aria-label="Excluir" onClick={() => delM.mutate(f.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">Nenhum fluxo salvo ainda.</div>
        )}
      </div>
    </div>
  );
}
