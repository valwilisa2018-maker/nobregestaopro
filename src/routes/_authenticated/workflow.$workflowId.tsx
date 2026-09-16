import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import {
  RUN_STATUS_LABEL,
  UNAVAILABLE_TRIGGERS,
  WORKFLOW_STATUS_LABEL,
  WORKFLOW_TRIGGERS,
  ensurePositions,
  validateBlocks,
  type WorkflowBlock,
  type WorkflowBlockType,
} from "@/lib/workflow-shared";
import { FlowBuilder } from "@/components/workflow/canvas/flow-builder";
import {
  workflowDetail,
  workflowRunAction,
  workflowSaveBlocks,
  workflowSaveTriggers,
} from "@/lib/workflow.functions";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Save,
  Workflow as WorkflowIcon,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/workflow/$workflowId")({
  component: WorkflowBuilderPage,
  head: () => ({
    meta: [
      { title: "Editar workflow | Nobre Gestão" },
      {
        name: "description",
        content:
          "Monte os blocos do seu fluxo de conversa, defina os gatilhos e publique para começar a atender.",
      },
      { property: "og:title", content: "Editar workflow | Nobre Gestão" },
      {
        property: "og:description",
        content: "Construtor de fluxos de conversa no WhatsApp por vendedor.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Detail = Awaited<ReturnType<typeof workflowDetail>>;
type TriggerRow = {
  trigger_type: string;
  keyword?: string | null;
  tag?: string | null;
  is_default_for_new_customers?: boolean;
  active?: boolean;
};

function WorkflowBuilderPage() {
  const { workflowId } = Route.useParams();
  const load = useServerFn(workflowDetail);
  const saveBlocks = useServerFn(workflowSaveBlocks);
  const saveTriggers = useServerFn(workflowSaveTriggers);
  const runAction = useServerFn(workflowRunAction);

  const [detail, setDetail] = useState<Detail | null>(null);
  const [blocks, setBlocks] = useState<WorkflowBlock[]>([]);
  const [triggers, setTriggers] = useState<TriggerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const result = await load({ data: { id: workflowId } });
      setDetail(result);
      setBlocks(ensurePositions((result.draft?.blocks ?? []) as WorkflowBlock[]));
      setTriggers((result.triggers ?? []) as TriggerRow[]);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível abrir este workflow."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflowId]);

  const canEdit = detail?.canEdit ?? false;


  const persist = async (publish: boolean) => {
    if (publish) {
      const problem = validateBlocks(blocks);
      if (problem) {
        toast.error(problem);
        return;
      }
    }
    setBusy(true);
    try {
      await saveBlocks({ data: { id: workflowId, blocks, publish } });
      toast.success(publish ? "Fluxo publicado e ativo." : "Rascunho salvo.");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar o fluxo."));
    } finally {
      setBusy(false);
    }
  };

  const toggleTrigger = (value: string, on: boolean) =>
    setTriggers((prev) =>
      on
        ? [...prev.filter((t) => t.trigger_type !== value), { trigger_type: value, active: true }]
        : prev.filter((t) => t.trigger_type !== value),
    );

  const persistTriggers = async () => {
    setBusy(true);
    try {
      await saveTriggers({ data: { id: workflowId, triggers } });
      toast.success("Gatilhos salvos.");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar os gatilhos."));
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando fluxo...
      </div>
    );
  }
  if (!detail) return null;

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Workflow"
        icon={WorkflowIcon}
        title={detail.workflow.name}
        description={
          detail.workflow.description ||
          "Monte a conversa, defina os gatilhos e publique para começar a atender."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={detail.workflow.status === "active" ? "default" : "outline"}>
              {WORKFLOW_STATUS_LABEL[detail.workflow.status] ?? detail.workflow.status}
            </Badge>
            <Button asChild variant="outline" size="sm">
              <Link to="/workflow">
                <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
              </Link>
            </Button>
          </div>
        }
      />

      <Tabs defaultValue="blocos">
        <TabsList>
          <TabsTrigger value="blocos">Blocos da conversa</TabsTrigger>
          <TabsTrigger value="gatilhos">Gatilhos</TabsTrigger>
          <TabsTrigger value="execucoes">Conversas</TabsTrigger>
        </TabsList>

        <TabsContent value="blocos" className="space-y-4 pt-4">
          {!canEdit && (
            <Card>
              <CardContent className="p-4 text-sm text-muted-foreground">
                Você está apenas visualizando este fluxo. Use “Duplicar para meus workflows” para
                criar a sua própria versão.
              </CardContent>
            </Card>
          )}

          <FlowBuilder
            blocks={blocks}
            onBlocksChange={setBlocks}
            canEdit={canEdit}
            toolbar={
              canEdit ? (
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" disabled={busy} onClick={() => persist(false)}>
                    {busy ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar rascunho
                  </Button>
                  <Button disabled={busy} onClick={() => persist(true)}>
                    <CheckCircle2 className="mr-2 h-4 w-4" /> Publicar e ativar
                  </Button>
                </div>
              ) : null
            }
          />
        </TabsContent>


        <TabsContent value="gatilhos" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Quando este fluxo começa</CardTitle>
              <CardDescription>
                Escolha as situações que iniciam a conversa automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {WORKFLOW_TRIGGERS.map((trigger) => {
                const current = triggers.find((t) => t.trigger_type === trigger.value);
                return (
                  <div key={trigger.value} className="space-y-2 rounded-lg border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{trigger.label}</p>
                        <p className="text-xs text-muted-foreground">{trigger.description}</p>
                      </div>
                      <Switch
                        disabled={!canEdit}
                        checked={Boolean(current)}
                        onCheckedChange={(checked) => toggleTrigger(trigger.value, checked)}
                      />
                    </div>
                    {current && trigger.value === "keyword" && (
                      <Input
                        disabled={!canEdit}
                        value={current.keyword ?? ""}
                        onChange={(e) =>
                          setTriggers((prev) =>
                            prev.map((t) =>
                              t.trigger_type === "keyword" ? { ...t, keyword: e.target.value } : t,
                            ),
                          )
                        }
                        placeholder="orçamento"
                      />
                    )}
                    {current && trigger.value === "customer_created" && (
                      <label className="flex items-center gap-2 text-xs text-muted-foreground">
                        <input
                          type="checkbox"
                          disabled={!canEdit}
                          checked={Boolean(current.is_default_for_new_customers)}
                          onChange={(e) =>
                            setTriggers((prev) =>
                              prev.map((t) =>
                                t.trigger_type === "customer_created"
                                  ? { ...t, is_default_for_new_customers: e.target.checked }
                                  : t,
                              ),
                            )
                          }
                        />
                        Usar como fluxo padrão para clientes novos deste vendedor
                      </label>
                    )}
                  </div>
                );
              })}
              <div className="rounded-lg border border-dashed p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Ainda não disponíveis nesta versão
                </p>
                <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                  {UNAVAILABLE_TRIGGERS.map((item) => (
                    <li key={item}>• {item}</li>
                  ))}
                </ul>
              </div>
              {canEdit && (
                <Button disabled={busy} onClick={persistTriggers}>
                  <Save className="mr-2 h-4 w-4" /> Salvar gatilhos
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="execucoes" className="space-y-3 pt-4">
          {(detail.runs ?? []).length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-sm text-muted-foreground">
                Nenhuma conversa iniciada por este fluxo.
              </CardContent>
            </Card>
          ) : (
            (detail.runs ?? []).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {(run as { customers?: { name?: string } | null }).customers?.name ?? "Cliente"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Atualizado em {new Date(run.updated_at).toLocaleString("pt-BR")}
                    {run.error ? ` • ${run.error}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>
                    {RUN_STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                  {canEdit && !["DONE", "CANCELLED"].includes(run.status) && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          await runAction({ data: { runId: run.id, action: "cancel" } });
                          toast.success("Conversa cancelada.");
                          await refresh();
                        } catch (e) {
                          toast.error(getErrorMessage(e, "Não foi possível cancelar."));
                        }
                      }}
                    >
                      <XCircle className="mr-2 h-4 w-4" /> Cancelar
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export type { WorkflowBlockType };
