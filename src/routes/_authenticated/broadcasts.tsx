import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, CheckCircle2, Clock, Loader2, Rocket, Send, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { listContacts } from "@/lib/contacts.functions";
import { createBroadcast, listBroadcasts, runBroadcastBatch } from "@/lib/broadcasts.functions";
import { listFlows } from "@/lib/flows.functions";

export const Route = createFileRoute("/_authenticated/broadcasts")({
  component: BroadcastsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nada por aqui.</div>,
});

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function BroadcastsPage() {
  const list = useServerFn(listContacts);
  const create = useServerFn(createBroadcast);
  const run = useServerFn(runBroadcastBatch);
  const listB = useServerFn(listBroadcasts);
  const listF = useServerFn(listFlows);
  const qc = useQueryClient();

  const contacts = useQuery({
    queryKey: ["contacts-all-for-broadcast"],
    queryFn: () => list({ data: { q: "", status: "active", page: 1, pageSize: 200 } }),
  });
  const broadcasts = useQuery({ queryKey: ["broadcasts"], queryFn: () => listB() });
  const flows = useQuery({ queryKey: ["flows-for-broadcast"], queryFn: () => listF() });

  // Connections
  const [connections, setConnections] = useState<Array<{ id: string; instance_name: string | null }>>([]);
  useEffect(() => {
    supabase.from("connections").select("id,instance_name").eq("status", "online").then(({ data }) => setConnections(data ?? []));
  }, []);

  // Wizard state
  const [step, setStep] = useState(1);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [name, setName] = useState("Disparo " + new Date().toLocaleDateString("pt-BR"));
  const [message, setMessage] = useState("Olá {nome}, tudo bem?");
  const [mediaUrl, setMediaUrl] = useState("");
  const [connectionId, setConnectionId] = useState<string>("");
  const [flowId, setFlowId] = useState<string>("");
  const [mode, setMode] = useState<"quick" | "sequential">("quick");
  const [delay, setDelay] = useState(10);
  const [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);

  const rows = contacts.data?.rows ?? [];
  const selectedIds = useMemo(() => Object.keys(selected).filter((k) => selected[k]), [selected]);
  const allChecked = rows.length > 0 && rows.every((r) => selected[r.id as string]);

  const toggleAll = () => {
    const next: Record<string, boolean> = {};
    if (!allChecked) rows.forEach((r) => { next[r.id as string] = true; });
    setSelected(next);
  };

  // Progress state
  const [runningId, setRunningId] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ sent: number; error: number; total: number } | null>(null);

  const createM = useMutation({
    mutationFn: async () => create({ data: {
      name, message, media_url: mediaUrl || null, media_type: mediaUrl ? "image" : null,
      connection_id: connectionId || null, flow_id: flowId || null,
      mode, delay_seconds: delay, weekdays,
      contact_ids: selectedIds,
    } }),
    onSuccess: async (res) => {
      toast.success("Disparo criado");
      qc.invalidateQueries({ queryKey: ["broadcasts"] });
      if (mode === "quick") {
        setRunningId(res.id);
        setProgress({ sent: 0, error: 0, total: res.total });
        // Poll batches
        (async () => {
          for (;;) {
            const r = await run({ data: { id: res.id, batch: 5 } });
            setProgress({ sent: r.sent, error: r.error, total: r.total });
            if (r.done) break;
          }
          toast.success("Envio concluído");
          qc.invalidateQueries({ queryKey: ["broadcasts"] });
        })().catch((e: Error) => toast.error(e.message));
      }
      setStep(1); setSelected({});
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canNext = (step === 1 && selectedIds.length > 0) ||
                  (step === 2 && message.trim().length > 0) ||
                  (step === 3 && (mode === "quick" ? delay >= 1 : weekdays.length > 0));

  const estimatedSec = mode === "quick" ? selectedIds.length * delay : 0;
  const est = estimatedSec > 60 ? `~${Math.round(estimatedSec / 60)} min` : `~${estimatedSec}s`;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Send className="h-5 w-5" /></div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Disparo em Massa</h1>
          <p className="text-xs text-muted-foreground">Envio para múltiplos contatos com controle de intervalo e sequência</p>
        </div>
      </div>

      {/* Progress card while running */}
      {runningId && progress && (
        <Card className="border-primary/40">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Rocket className="h-4 w-4 text-primary" /> Envio em andamento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Progress value={progress.total ? ((progress.sent + progress.error) / progress.total) * 100 : 0} />
            <div className="flex gap-4 text-sm">
              <span className="text-emerald-500">✓ {progress.sent} enviados</span>
              <span className="text-destructive">✗ {progress.error} erros</span>
              <span className="text-muted-foreground ml-auto">{progress.sent + progress.error}/{progress.total}</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stepper header */}
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold transition-all
              ${step >= n ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>{n}</div>
            {n < 4 && <div className={`h-0.5 w-10 ${step > n ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
        <div className="ml-3 text-sm text-muted-foreground">
          {step === 1 && "Destinatários"}
          {step === 2 && "Conteúdo"}
          {step === 3 && "Configuração"}
          {step === 4 && "Resumo"}
        </div>
      </div>

      {/* Steps */}
      <Card>
        <CardContent className="p-6 space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Users className="h-4 w-4" /> Selecione os destinatários</h3>
                <div className="flex items-center gap-3 text-sm">
                  <span className="text-muted-foreground">{selectedIds.length} selecionado(s)</span>
                  <Button size="sm" variant="outline" onClick={toggleAll}>{allChecked ? "Desmarcar todos" : "Selecionar todos"}</Button>
                </div>
              </div>
              <div className="border rounded-lg max-h-[420px] overflow-y-auto">
                {contacts.isLoading ? (
                  <div className="p-6 text-sm text-muted-foreground">Carregando…</div>
                ) : rows.length === 0 ? (
                  <div className="p-6 text-sm text-muted-foreground">Sem contatos ativos. Adicione contatos na aba Contatos.</div>
                ) : rows.map((r) => (
                  <label key={r.id as string} className="flex items-center gap-3 px-4 py-2.5 border-b last:border-b-0 hover:bg-accent/30 cursor-pointer">
                    <Checkbox checked={!!selected[r.id as string]} onCheckedChange={(v) => setSelected((s) => ({ ...s, [r.id as string]: !!v }))} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{(r.name as string) || "Sem nome"}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{r.phone as string}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <Label>Nome da campanha</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <Label>Mensagem</Label>
                <Textarea rows={6} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Olá {nome}, aqui é da..." />
                <p className="text-xs text-muted-foreground mt-1">Variáveis: <code>{"{nome}"}</code>, <code>{"{telefone}"}</code></p>
              </div>
              <div>
                <Label>URL da mídia (opcional)</Label>
                <Input value={mediaUrl} onChange={(e) => setMediaUrl(e.target.value)} placeholder="https://..." />
              </div>
              <div>
                <Label>Instância WhatsApp</Label>
                <Select value={connectionId} onValueChange={setConnectionId}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma instância conectada" /></SelectTrigger>
                  <SelectContent>
                    {connections.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.instance_name ?? c.id}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fluxo de conversa (opcional)</Label>
                <Select value={flowId || "__none__"} onValueChange={(v) => setFlowId(v === "__none__" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Nenhum — enviar apenas a mensagem" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Nenhum — enviar apenas a mensagem</SelectItem>
                    {(flows.data?.flows ?? []).map((f) => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">Ao selecionar um fluxo, cada contato entra automaticamente no fluxo salvo em Fluxos de Conversa.</p>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <RadioGroup value={mode} onValueChange={(v) => setMode(v as never)} className="grid md:grid-cols-2 gap-3">
                <label className={`border rounded-lg p-4 cursor-pointer transition ${mode === "quick" ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="quick" />
                    <div>
                      <div className="font-semibold flex items-center gap-2"><Rocket className="h-4 w-4" /> Disparo Rápido</div>
                      <p className="text-xs text-muted-foreground mt-1">Envia todas as mensagens agora com intervalo definido.</p>
                    </div>
                  </div>
                </label>
                <label className={`border rounded-lg p-4 cursor-pointer transition ${mode === "sequential" ? "border-primary bg-primary/5" : ""}`}>
                  <div className="flex items-start gap-3">
                    <RadioGroupItem value="sequential" />
                    <div>
                      <div className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Disparo Sequencial</div>
                      <p className="text-xs text-muted-foreground mt-1">Envia diariamente nos dias selecionados, um por dia após a entrada.</p>
                    </div>
                  </div>
                </label>
              </RadioGroup>

              {mode === "quick" ? (
                <div>
                  <Label>Intervalo entre mensagens (segundos)</Label>
                  <Input type="number" min={1} max={600} value={delay} onChange={(e) => setDelay(Number(e.target.value) || 1)} className="max-w-[160px]" />
                </div>
              ) : (
                <div>
                  <Label>Dias da semana</Label>
                  <div className="flex gap-2 mt-2">
                    {WEEKDAYS.map((d, i) => {
                      const on = weekdays.includes(i);
                      return (
                        <button key={i} type="button"
                          onClick={() => setWeekdays((w) => on ? w.filter((x) => x !== i) : [...w, i].sort())}
                          className={`h-10 w-12 rounded-lg text-sm font-medium transition
                            ${on ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>{d}</button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="grid md:grid-cols-3 gap-3">
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">Destinatários</div>
                  <div className="text-3xl font-bold tabular-nums">{selectedIds.length}</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">Modo</div>
                  <div className="text-lg font-semibold capitalize">{mode === "quick" ? "Rápido" : "Sequencial"}</div>
                </div>
                <div className="border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">Tempo estimado</div>
                  <div className="text-lg font-semibold">{mode === "quick" ? est : "—"}</div>
                </div>
              </div>
              <div className="border rounded-lg p-4 bg-muted/30">
                <div className="text-xs uppercase text-muted-foreground mb-1">Prévia</div>
                <div className="text-sm whitespace-pre-wrap">{message}</div>
              </div>
              {!connectionId && <p className="text-sm text-destructive">Selecione uma instância WhatsApp na etapa 2.</p>}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t">
            <Button variant="outline" disabled={step === 1} onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="h-4 w-4" /> Voltar
            </Button>
            {step < 4 ? (
              <Button disabled={!canNext} onClick={() => setStep((s) => s + 1)}>
                Próximo <ArrowRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button disabled={!connectionId || createM.isPending} onClick={() => createM.mutate()}>
                {createM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Confirmar e enviar
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">Histórico de disparos</CardTitle></CardHeader>
        <CardContent className="p-0">
          {(broadcasts.data?.rows ?? []).length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Nenhum disparo ainda.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2">Campanha</th>
                    <th className="text-left px-4 py-2">Modo</th>
                    <th className="text-left px-4 py-2">Status</th>
                    <th className="text-left px-4 py-2">Progresso</th>
                    <th className="text-left px-4 py-2">Criado</th>
                  </tr>
                </thead>
                <tbody>
                  {(broadcasts.data?.rows ?? []).map((b) => (
                    <tr key={b.id as string} className="border-t">
                      <td className="px-4 py-2 font-medium">{b.name as string}</td>
                      <td className="px-4 py-2 capitalize">{(b.mode as string) === "quick" ? "Rápido" : "Sequencial"}</td>
                      <td className="px-4 py-2"><Badge variant="secondary" className="capitalize">{b.status as string}</Badge></td>
                      <td className="px-4 py-2 tabular-nums">{b.sent_count as number}/{b.total as number} <span className="text-destructive">({b.error_count as number} erros)</span></td>
                      <td className="px-4 py-2 text-muted-foreground">{new Date(b.created_at as string).toLocaleString("pt-BR")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}