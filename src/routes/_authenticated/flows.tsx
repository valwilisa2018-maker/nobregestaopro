import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useMemo, useState, useEffect, useRef } from "react";
import {
  Workflow, Sparkles, Bot, Save, Trash2, Loader2, MessageSquare, GitBranch,
  Image as ImageIcon, Video, Music, HelpCircle, Play, Square, Webhook, Clock, User,
  Keyboard, Mic, Tag, UserPlus, Calendar, Send, ArrowLeft, Upload, Layers,
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
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, addEdge, useEdgesState,
  useNodesState, Handle, Position, type Node, type Edge, type Connection, type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { generateFlow, saveFlow, listFlows, deleteFlow } from "@/lib/flows.functions";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export const Route = createFileRoute("/_authenticated/flows")({
  head: () => ({ meta: [{ title: "Fluxos de Conversa com IA — Plataforma" }] }),
  component: Page,
});

type NodeKind =
  | "START" | "MESSAGE" | "CONDITION" | "YESNO" | "IMAGE" | "VIDEO" | "AUDIO"
  | "QUESTION" | "WAIT" | "WEBHOOK" | "HANDOFF" | "END"
  | "TYPING" | "RECORDING" | "TAGS" | "CAPTURE_NAME" | "SCHEDULE" | "BROADCAST" | "SEQUENCE";

type BlockData = {
  label: string;
  kind: NodeKind;
  text?: string;
  url?: string;
  condition?: string;
  variable?: string;
  seconds?: number;
  mediaName?: string;
  nextTrigger?: string;
};

type OutputDef = { id: string; label: string };
const KIND_META: Record<NodeKind, { label: string; sub: string; hint: string; icon: React.ReactNode; color: string; outputs: OutputDef[] }> = {
  START:        { label: "Gatilho",       sub: "Inicia o fluxo",             hint: "Ponto de partida do fluxo. Define quando ele começa.", icon: <Play className="h-3.5 w-3.5" />,         color: "bg-emerald-500", outputs: [{ id: "out", label: "saída" }] },
  MESSAGE:      { label: "Mensagem",      sub: "Enviar texto",               hint: "Envia uma mensagem de texto ao contato.", icon: <MessageSquare className="h-3.5 w-3.5" />, color: "bg-blue-500",  outputs: [{ id: "out", label: "saída" }] },
  CONDITION:    { label: "Condição",      sub: "Dividir o fluxo",            hint: "Divide o fluxo em dois caminhos com base em uma condição.", icon: <GitBranch className="h-3.5 w-3.5" />,    color: "bg-amber-500",   outputs: [{ id: "true", label: "Verdadeiro" }, { id: "false", label: "Falso" }] },
  WAIT:         { label: "Aguardar",      sub: "Tempo de espera",            hint: "Aguarda um tempo antes de seguir para o próximo bloco.", icon: <Clock className="h-3.5 w-3.5" />,        color: "bg-slate-500",   outputs: [{ id: "out", label: "saída" }] },
  VIDEO:        { label: "Vídeo",         sub: "Enviar vídeo",               hint: "Envia um arquivo de vídeo para o contato (upload).", icon: <Video className="h-3.5 w-3.5" />,        color: "bg-rose-500",    outputs: [{ id: "out", label: "saída" }] },
  IMAGE:        { label: "Imagem",        sub: "Enviar imagem",              hint: "Envia uma imagem para o contato (upload).", icon: <ImageIcon className="h-3.5 w-3.5" />,    color: "bg-pink-500",    outputs: [{ id: "out", label: "saída" }] },
  AUDIO:        { label: "Áudio",         sub: "Enviar áudio",               hint: "Envia um áudio para o contato (upload).", icon: <Music className="h-3.5 w-3.5" />,        color: "bg-purple-500",  outputs: [{ id: "out", label: "saída" }] },
  TYPING:       { label: "Digitando",     sub: "Simular digitação",          hint: "Mostra 'digitando...' para simular uma resposta humana.", icon: <Keyboard className="h-3.5 w-3.5" />,     color: "bg-teal-500",    outputs: [{ id: "out", label: "saída" }] },
  RECORDING:    { label: "Gravando",      sub: "Simular gravação",           hint: "Mostra 'gravando áudio...' antes de enviar.", icon: <Mic className="h-3.5 w-3.5" />,          color: "bg-red-500",     outputs: [{ id: "out", label: "saída" }] },
  TAGS:         { label: "Etiquetas",     sub: "Adicionar etiquetas",        hint: "Adiciona etiquetas ao contato para segmentação.", icon: <Tag className="h-3.5 w-3.5" />,          color: "bg-lime-500",    outputs: [{ id: "out", label: "saída" }] },
  QUESTION:     { label: "Pergunta",      sub: "Aguardar resposta",          hint: "Envia uma pergunta e aguarda o contato responder.", icon: <HelpCircle className="h-3.5 w-3.5" />,   color: "bg-indigo-500",  outputs: [{ id: "out", label: "saída" }] },
  CAPTURE_NAME: { label: "Capturar Nome", sub: "Pergunta e salva o nome",    hint: "Pergunta o nome do contato e salva na variável nome.", icon: <UserPlus className="h-3.5 w-3.5" />,     color: "bg-sky-500",     outputs: [{ id: "out", label: "saída" }] },
  SCHEDULE:     { label: "Agendamento",   sub: "Agendar reunião",            hint: "Envia link/instrução de agendamento.", icon: <Calendar className="h-3.5 w-3.5" />,     color: "bg-yellow-500",  outputs: [{ id: "out", label: "saída" }] },
  BROADCAST:    { label: "Disparo",       sub: "Disparo em massa",           hint: "Envia mensagem para vários contatos.", icon: <Send className="h-3.5 w-3.5" />,         color: "bg-orange-500",  outputs: [{ id: "out", label: "saída" }] },
  YESNO:        { label: "Sim / Não",     sub: "Dividir por resposta",       hint: "Divide o fluxo com base em resposta Sim ou Não.", icon: <GitBranch className="h-3.5 w-3.5" />,    color: "bg-amber-600",   outputs: [{ id: "sim", label: "Sim" }, { id: "não", label: "Não" }] },
  WEBHOOK:      { label: "Webhook",       sub: "Chamar API externa",         hint: "Faz uma requisição HTTP para um serviço externo.", icon: <Webhook className="h-3.5 w-3.5" />,      color: "bg-cyan-600",    outputs: [{ id: "out", label: "saída" }] },
  HANDOFF:      { label: "Atendente",     sub: "Transferir para humano",     hint: "Transfere a conversa para um atendente humano.", icon: <User className="h-3.5 w-3.5" />,         color: "bg-fuchsia-600", outputs: [{ id: "out", label: "saída" }] },
  SEQUENCE:     { label: "Sequência",     sub: "Etiqueta + inscrever em fluxo", hint: "Adiciona etiqueta ao contato e o inscreve em outro fluxo. Ao terminar este, o fluxo alvo é iniciado.", icon: <Layers className="h-3.5 w-3.5" />, color: "bg-violet-600", outputs: [{ id: "out", label: "saída" }] },
  END:          { label: "Fim",           sub: "Encerrar fluxo",             hint: "Finaliza o fluxo.", icon: <Square className="h-3.5 w-3.5" />,       color: "bg-neutral-700", outputs: [] },
};

const PALETTE_ORDER: NodeKind[] = [
  "START", "MESSAGE", "CONDITION", "WAIT", "VIDEO", "IMAGE", "AUDIO",
  "TYPING", "RECORDING", "TAGS", "SEQUENCE", "QUESTION", "CAPTURE_NAME", "SCHEDULE",
  "BROADCAST", "YESNO", "WEBHOOK", "HANDOFF", "END",
];

const VIDEO_UPLOAD_LIMIT_BYTES = 20 * 1024 * 1024;
const FAST_UPLOAD_TIMEOUT_MS = 35_000;

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function uploadMediaFast(
  path: string,
  file: File,
  contentType: string,
  onProgress?: (pct: number) => void,
) {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
  if (!supabaseUrl || !publishableKey) throw new Error("Configuração de upload indisponível.");

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sessão expirada. Entre novamente para enviar mídia.");

  const url = `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/agent-media/${encodeStoragePath(path)}`;
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const timeout = window.setTimeout(() => {
      xhr.abort();
      reject(new Error("O upload demorou demais. Reduza o vídeo para menos de 10 MB e tente novamente."));
    }, FAST_UPLOAD_TIMEOUT_MS);
    xhr.open("POST", url, true);
    xhr.setRequestHeader("apikey", publishableKey);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("cache-control", "31536000");
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((ev.loaded / ev.total) * 100)));
      }
    };
    xhr.onload = () => {
      window.clearTimeout(timeout);
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(new Error(`HTTP ${xhr.status}${xhr.responseText ? `: ${xhr.responseText.slice(0, 180)}` : ""}`));
      }
    };
    xhr.onerror = () => {
      window.clearTimeout(timeout);
      reject(new Error("Falha de rede no upload"));
    };
    xhr.onabort = () => window.clearTimeout(timeout);
    xhr.send(file);
  });
}

function BlockNode({ data, selected }: NodeProps) {
  const d = data as unknown as BlockData;
  const meta = KIND_META[d.kind];
  const preview = d.text || d.mediaName || d.condition || d.nextTrigger || d.url || meta.sub;
  const invalid = (d as unknown as { _invalid?: boolean })._invalid;
  return (
    <div className={`rounded-lg border bg-card shadow-md w-[220px] max-w-[220px] transition ${selected ? "ring-2 ring-primary" : ""} ${invalid ? "border-destructive ring-2 ring-destructive animate-pulse" : "border-emerald-500/40"}`}>
      {d.kind !== "START" && <Handle type="target" position={Position.Left} />}
      <div className="flex items-center gap-2 px-3 py-1.5 text-[10px] uppercase tracking-wide text-muted-foreground border-b border-border/50">
        <span className={`h-4 w-4 rounded flex items-center justify-center text-white ${meta.color}`}>{meta.icon}</span>
        <span>{meta.label}</span>
      </div>
      <div className="px-3 py-2 min-h-[36px] overflow-hidden">
        <div className="text-xs font-semibold text-foreground truncate">{d.label}</div>
        <div className="text-[11px] text-muted-foreground truncate">{preview}</div>
      </div>
      {meta.outputs.length === 1 && <Handle type="source" position={Position.Right} id={meta.outputs[0].id} />}
      {meta.outputs.length > 1 && meta.outputs.map((o, i) => (
        <div key={o.id} className="relative">
          <div className="text-[10px] text-muted-foreground px-3 py-0.5 text-right pr-6">{o.label}</div>
          <Handle
            type="source" position={Position.Right} id={o.id}
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
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

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
    mutationFn: async () => {
      // Validate: every node (except START) needs an incoming edge, every non-END needs outgoing edge / branches
      const badIds = new Set<string>();
      for (const n of nodes) {
        const k = n.data.kind;
        const hasIn = edges.some((e) => e.target === n.id);
        const hasOut = edges.some((e) => e.source === n.id);
        if (k !== "START" && !hasIn) badIds.add(n.id);
        if (k !== "END" && !hasOut) badIds.add(n.id);
      }
      // Mark invalid nodes so they blink
      setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, _invalid: badIds.has(n.id) } as BlockData })));
      if (badIds.size > 0) {
        // Auto-clear after 4s
        setTimeout(() => {
          setNodes((ns) => ns.map((n) => ({ ...n, data: { ...n.data, _invalid: false } as BlockData })));
        }, 4000);
        const names = nodes.filter((n) => badIds.has(n.id)).map((n) => n.data.label).slice(0, 3).join(", ");
        throw new Error(`Existem ${badIds.size} bloco(s) desconectado(s): ${names}${badIds.size > 3 ? "…" : ""}. Conecte todos os blocos antes de salvar.`);
      }
      if (!nodes.some((n) => n.data.kind === "START")) throw new Error("O fluxo precisa de um bloco Gatilho (START).");
      if (!nodes.some((n) => n.data.kind === "END")) throw new Error("O fluxo precisa de pelo menos um bloco Fim (END).");
      return save({ data: {
      id: flowId, name, trigger,
      description: null,
      definition: { nodes, edges } as unknown as Record<string, unknown>,
    } });
    },
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
          IF: "CONDITION", SWITCH: "CONDITION", CONDITION: "CONDITION",
          BUTTONS: "YESNO", LIST: "YESNO", YESNO: "YESNO",
          IMAGE: "IMAGE", VIDEO: "VIDEO", AUDIO: "AUDIO",
          WAIT: "WAIT", TYPING: "TYPING", RECORDING: "RECORDING",
          WEBHOOK: "WEBHOOK", HTTP: "WEBHOOK", HANDOFF: "HANDOFF",
          CAPTURE: "CAPTURE_NAME", CAPTURE_NAME: "CAPTURE_NAME",
          TAG: "TAGS", TAGS: "TAGS", LABEL_ADD: "TAGS",
          SCHEDULE: "SCHEDULE", BROADCAST: "BROADCAST",
        };
        const newNodes: Node<BlockData>[] = src.map((n, i) => ({
          id: n.id, type: "block",
          position: { x: 60 + (i % 4) * 260, y: 60 + Math.floor(i / 4) * 200 },
          data: {
            kind: kindMap[n.type?.toUpperCase()] ?? "MESSAGE",
            label: n.name ?? n.type,
            text: n.message,
          },
        }));
        const newEdges: Edge[] = [];
        const ids = new Set(src.map((n) => n.id));
        for (let i = 0; i < src.length; i++) {
          const n = src[i];
          const hasBranches = n.branches && Object.keys(n.branches).length > 0;
          if (n.next && ids.has(n.next)) {
            newEdges.push({ id: `${n.id}-${n.next}`, source: n.id, target: n.next, animated: true });
          } else if (!hasBranches && n.type !== "END" && i < src.length - 1) {
            // auto-chain sequentially when AI omits `next`
            const nxt = src[i + 1].id;
            newEdges.push({ id: `${n.id}-${nxt}`, source: n.id, target: nxt, animated: true });
          }
          if (n.branches) for (const [k, v] of Object.entries(n.branches)) {
            if (ids.has(v)) newEdges.push({ id: `${n.id}-${k}-${v}`, source: n.id, target: v, label: k, animated: true });
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

  const kinds = useMemo(() => PALETTE_ORDER, []);

  async function handleMediaUpload(file: File) {
    if (!user || !selected) return;
    if (selected.data.kind === "VIDEO" && file.size > VIDEO_UPLOAD_LIMIT_BYTES) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      toast.error(
        `Vídeo muito grande (${mb} MB). Limite máximo: 20 MB. Converta/reduza o vídeo (ex.: HandBrake, CloudConvert ou ffmpeg) e tente novamente.`,
        { duration: 8000 },
      );
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    setUploading(true);
    setUploadPct(0);
    try {
      const safeName = file.name.replace(/[^\w.\-]+/g, "_");
      const path = `${user.id}/flows/${selected.id}-${Date.now()}-${safeName}`;
      const kindGuess =
        selected.data.kind === "IMAGE" ? "image/jpeg" :
        selected.data.kind === "VIDEO" ? "video/mp4" :
        selected.data.kind === "AUDIO" ? "audio/mpeg" : "application/octet-stream";
      const contentType = file.type && file.type.length > 0 ? file.type : kindGuess;
      let lastErr: unknown = null;
      let ok = false;
      for (let attempt = 0; attempt < 2 && !ok; attempt++) {
        try {
          await uploadMediaFast(path, file, contentType, setUploadPct);
          ok = true;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (!/520|522|524|network|fetch|failed to fetch/i.test(msg) || /demorou demais/i.test(msg)) break;
          await new Promise((r) => setTimeout(r, 700));
        }
      }
      if (!ok) {
        const msg = String((lastErr as { message?: string })?.message ?? "Erro desconhecido");
        if (/520|522|524/.test(msg)) {
          throw new Error("O servidor de arquivos recusou o upload (erro temporário do CDN). Aguarde alguns segundos e tente novamente. Se persistir, reduza o tamanho do arquivo.");
        }
        throw new Error(msg);
      }
      const signed = await supabase.storage.from("agent-media").createSignedUrl(path, 60 * 60 * 24 * 365);
      const url = signed.data?.signedUrl;
      if (!url) throw new Error("Falha ao gerar URL do arquivo");
      updateSelected({ url, mediaName: file.name });
      toast.success("Arquivo enviado");
    } catch (e) {
      console.error("[flows] upload failed", e);
      toast.error(e instanceof Error ? e.message : "Falha ao enviar arquivo", { duration: 8000 });
    } finally {
      setUploading(false);
      setUploadPct(0);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => { setFlowId(null); setNodes([{ id: "start", type: "block", position: { x: 80, y: 160 }, data: { kind: "START", label: "Início" } }]); setEdges([]); setName("Novo fluxo"); setTrigger(""); setSelected(null); }} aria-label="Voltar">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Input className="max-w-[280px]" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome do fluxo" />
        <div className="ml-auto flex flex-wrap gap-2">
          <Dialog open={aiOpen} onOpenChange={setAiOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm"><Bot className="h-4 w-4" /> Gerar IA</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Gerar fluxo com IA</DialogTitle></DialogHeader>
              <Textarea rows={5} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder="Ex.: Qualifica lead de imóvel, pede nome/cidade e envia para o corretor" />
              <Button onClick={() => genM.mutate()} disabled={!aiPrompt.trim() || genM.isPending}>
                {genM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bot className="h-4 w-4" />} Gerar
              </Button>
            </DialogContent>
          </Dialog>
          <Select
            value={flowId ?? "__new__"}
            onValueChange={(v) => {
              if (v === "__new__") return;
              const list = flowsQ.data?.flows ?? [];
              const f = list.find((x) => x.id === v);
              if (f) openFlow(f);
            }}
          >
            <SelectTrigger className="h-9 w-[220px]"><SelectValue placeholder="Fluxos salvos" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__new__">Fluxos salvos</SelectItem>
              {(flowsQ.data?.flows ?? []).map((f) => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" disabled={!flowId} onClick={() => flowId && delM.mutate(flowId)}>
            <Trash2 className="h-4 w-4" /> Excluir
          </Button>
          <Button size="sm" onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Salvar Fluxo
          </Button>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-[220px_1fr_280px]">
        {/* Palette */}
        <Card className="h-[calc(100vh-220px)] overflow-hidden flex flex-col">
          <CardHeader className="pb-2 shrink-0"><CardTitle className="text-[10px] uppercase tracking-widest text-muted-foreground">Blocos</CardTitle></CardHeader>
          <CardContent className="flex-1 overflow-y-auto space-y-1 pr-2">
            <TooltipProvider delayDuration={200}>
              {kinds.map((k) => {
                const m = KIND_META[k];
                return (
                  <Tooltip key={k}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => addBlock(k)}
                        className="w-full flex items-center gap-3 px-2 py-2 rounded-md hover:bg-accent text-left transition"
                      >
                        <span className={`h-6 w-6 rounded flex items-center justify-center text-white shrink-0 ${m.color}`}>{m.icon}</span>
                        <span className="flex flex-col min-w-0">
                          <span className="text-xs font-medium truncate">{m.label}</span>
                          <span className="text-[10px] text-muted-foreground truncate">{m.sub}</span>
                        </span>
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right" className="max-w-[220px] text-xs">{m.hint}</TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
            <div className="pt-3 mt-2 border-t space-y-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-2 pb-1">Modelos</div>
              {TEMPLATES.map((t) => (
                <Button key={t.name} size="sm" variant="ghost" className="w-full justify-start text-xs" onClick={() => loadTemplate(t)}>{t.name}</Button>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Canvas */}
        <div className="h-[calc(100vh-140px)] rounded-lg border bg-background overflow-hidden">
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
            <MiniMap
              pannable
              zoomable
              position="bottom-right"
              maskColor="rgba(0,0,0,0.5)"
              bgColor="hsl(var(--background))"
              nodeColor={() => "hsl(var(--primary))"}
              nodeStrokeColor="hsl(var(--primary))"
              nodeStrokeWidth={3}
              nodeBorderRadius={2}
              style={{ border: "none" }}
            />
          </ReactFlow>
        </div>

        {/* Inspector */}
        <Card className="h-[calc(100vh-220px)] overflow-y-auto">
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
                {["MESSAGE","QUESTION","YESNO","HANDOFF","TAGS","SCHEDULE","CAPTURE_NAME","SEQUENCE"].includes(selected.data.kind) && (
                  <div className="space-y-1">
                    <Label className="text-xs">
                      {selected.data.kind === "TAGS" || selected.data.kind === "SEQUENCE"
                        ? "Etiquetas (separadas por vírgula)"
                        : "Texto"}
                    </Label>
                    <Textarea rows={3} value={selected.data.text ?? ""} onChange={(e) => updateSelected({ text: e.target.value })} />
                  </div>
                )}
                {["IMAGE","VIDEO","AUDIO"].includes(selected.data.kind) && (
                  <div className="space-y-1">
                    <Label className="text-xs">Arquivo</Label>
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept={selected.data.kind === "IMAGE" ? "image/*" : selected.data.kind === "VIDEO" ? "video/*" : "audio/*"}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleMediaUpload(f);
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full gap-2"
                      onClick={() => fileRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {selected.data.url ? "Substituir arquivo" : `Enviar ${selected.data.kind === "IMAGE" ? "imagem" : selected.data.kind === "VIDEO" ? "vídeo" : "áudio"}`}
                    </Button>
                    {selected.data.mediaName && (
                      <p className="text-[11px] text-muted-foreground truncate">📎 {selected.data.mediaName}</p>
                    )}
                  </div>
                )}
                {["WEBHOOK","SCHEDULE"].includes(selected.data.kind) && (
                  <div className="space-y-1">
                    <Label className="text-xs">URL</Label>
                    <Input value={selected.data.url ?? ""} onChange={(e) => updateSelected({ url: e.target.value })} placeholder="https://..." />
                  </div>
                )}
                {selected.data.kind === "CONDITION" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Condição</Label>
                    <Input value={selected.data.condition ?? ""} onChange={(e) => updateSelected({ condition: e.target.value })} placeholder="ex.: {{cidade}} == 'SP'" />
                    <p className="text-[10px] text-muted-foreground">Saídas: <b>Verdadeiro</b> quando a condição for atendida, <b>Falso</b> caso contrário.</p>
                  </div>
                )}
                {selected.data.kind === "SEQUENCE" && (
                  <div className="space-y-1">
                    <Label className="text-xs">Inscrever em fluxo (gatilho do fluxo alvo)</Label>
                    <Input
                      value={selected.data.nextTrigger ?? ""}
                      onChange={(e) => updateSelected({ nextTrigger: e.target.value })}
                      placeholder="ex.: pos-venda"
                    />
                    <p className="text-[10px] text-muted-foreground">Ao passar por este bloco, o contato recebe as etiquetas acima e é inscrito no fluxo cujo gatilho corresponde. Esse fluxo inicia após o atual encerrar.</p>
                  </div>
                )}
                {(selected.data.kind === "QUESTION" || selected.data.kind === "YESNO") && (
                  <div className="space-y-1">
                    <Label className="text-xs">Salvar em variável</Label>
                    <Input value={selected.data.variable ?? ""} onChange={(e) => updateSelected({ variable: e.target.value })} placeholder="nome" />
                  </div>
                )}
                {["WAIT","TYPING","RECORDING"].includes(selected.data.kind) && (
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
