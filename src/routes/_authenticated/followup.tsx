import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import { workflowActiveList } from "@/lib/workflow.functions";
import {
  FOLLOWUP_STATUS_LABEL,
  MESSAGE_VARIABLES,
  TRIGGER_EVENTS,
  WEEKDAYS,
  triggerLabel,
} from "@/lib/followup-shared";
import {
  followupDeleteRule,
  followupOverview,
  followupQueueAction,
  followupRunNow,
  followupSaveRule,
} from "@/lib/followup.functions";
import { CalendarClock, Loader2, PlayCircle, Plus, Send, Trash2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/followup")({
  component: FollowupPage,
  head: () => ({
    meta: [
      { title: "Follow-up automático | Nobre Gestão" },
      {
        name: "description",
        content:
          "Crie regras de follow-up no WhatsApp e acompanhe os envios agendados, enviados e com falha.",
      },
      { property: "og:title", content: "Follow-up automático | Nobre Gestão" },
      {
        property: "og:description",
        content: "Regras automáticas de contato com clientes pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof followupOverview>>;
type QueueItem = Data["queue"][number];
type Rule = Data["rules"][number];

const emptyRule = {
  id: undefined as string | undefined,
  name: "",
  triggerEvent: "customer_created",
  delayDays: 3,
  whatsappMode: "default",
  connectionId: "",
  sellerId: "",
  message: "Olá {{primeiro_nome}}, tudo bem? Aqui é o {{vendedor}}...",
  startWorkflowId: "",
  allowedStart: "08:00",
  allowedEnd: "18:00",
  allowedWeekdays: [1, 2, 3, 4, 5],
  active: true,
};

function statusBadge(status: string) {
  const label = FOLLOWUP_STATUS_LABEL[status] ?? status;
  const variant =
    status === "SENT"
      ? "default"
      : status === "FAILED"
        ? "destructive"
        : status === "CANCELLED" || status === "SKIPPED"
          ? "outline"
          : "secondary";
  return <Badge variant={variant}>{label}</Badge>;
}

function toLocalInput(value: string) {
  const d = new Date(value);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function FollowupPage() {
  const load = useServerFn(followupOverview);
  const saveRule = useServerFn(followupSaveRule);
  const deleteRule = useServerFn(followupDeleteRule);
  const queueAction = useServerFn(followupQueueAction);
  const runNow = useServerFn(followupRunNow);

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [ruleForm, setRuleForm] = useState<typeof emptyRule | null>(null);
  const [reschedule, setReschedule] = useState<{ id: string; value: string } | null>(null);
  const [workflows, setWorkflows] = useState<{ id: string; name: string }[]>([]);
  const loadWorkflows = useServerFn(workflowActiveList);

  const refresh = async () => {
    try {
      setData(await load());
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar o Follow-up."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    void (async () => {
      try {
        const result = (await loadWorkflows()) as { workflows?: { id: string; name: string }[] };
        setWorkflows(result?.workflows ?? []);
      } catch {
        setWorkflows([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stats = useMemo(() => {
    const queue = data?.queue ?? [];
    const today = new Date().toDateString();
    return {
      today: queue.filter(
        (q) =>
          ["SCHEDULED", "PENDING", "WAITING_CONNECTION"].includes(q.status) &&
          new Date(q.scheduled_at).toDateString() === today,
      ).length,
      pending: queue.filter((q) =>
        ["SCHEDULED", "PENDING", "WAITING_CONNECTION"].includes(q.status),
      ).length,
      sent: queue.filter((q) => q.status === "SENT").length,
      failed: queue.filter((q) => q.status === "FAILED").length,
      activeRules: (data?.rules ?? []).filter((r) => r.active).length,
    };
  }, [data]);

  const openRule = (rule?: Rule) => {
    if (!rule) return setRuleForm({ ...emptyRule });
    setRuleForm({
      id: rule.id,
      name: rule.name,
      triggerEvent: rule.trigger_event,
      delayDays: rule.delay_days ?? 0,
      whatsappMode: rule.whatsapp_mode ?? "default",
      connectionId: rule.connection_id ?? "",
      sellerId: rule.seller_id ?? "",
      message: rule.message,
      startWorkflowId: (rule as { start_workflow_id?: string | null }).start_workflow_id ?? "",
      allowedStart: (rule.allowed_start ?? "08:00").slice(0, 5),
      allowedEnd: (rule.allowed_end ?? "18:00").slice(0, 5),
      allowedWeekdays: rule.allowed_weekdays ?? [1, 2, 3, 4, 5],
      active: rule.active,
    });
  };

  const handleSaveRule = async () => {
    if (!ruleForm) return;
    setBusy("rule");
    try {
      await saveRule({
        data: {
          id: ruleForm.id,
          name: ruleForm.name,
          triggerEvent: ruleForm.triggerEvent,
          delayDays: Number(ruleForm.delayDays),
          whatsappMode: ruleForm.whatsappMode,
          connectionId: ruleForm.connectionId || null,
          sellerId: ruleForm.sellerId || null,
          message: ruleForm.message,
          startWorkflowId: ruleForm.startWorkflowId || null,
          allowedStart: ruleForm.allowedStart,
          allowedEnd: ruleForm.allowedEnd,
          allowedWeekdays: ruleForm.allowedWeekdays,
          active: ruleForm.active,
        },
      });
      setRuleForm(null);
      toast.success("Regra salva.");
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar a regra."));
    } finally {
      setBusy(null);
    }
  };

  const act = async (id: string, action: "cancel" | "send_now", scheduledAt?: string) => {
    setBusy(id);
    try {
      const result = await queueAction({ data: { id, action, scheduledAt } });
      if (result.ok) toast.success(result.message);
      else toast.warning(result.message);
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível concluir a ação."));
    } finally {
      setBusy(null);
    }
  };

  const rows = (statuses: string[]) =>
    (data?.queue ?? []).filter((q) => statuses.includes(q.status));

  const QueueTable = ({ items, showActions }: { items: QueueItem[]; showActions?: boolean }) => (
    <Card>
      <CardContent className="p-0">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Nada por aqui.</p>
        ) : (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center gap-3 p-4 text-sm">
                <div className="min-w-[180px] flex-1">
                  <p className="font-medium">{item.customers?.name ?? "Cliente"}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.followup_rules?.name ?? "Regra removida"} •{" "}
                    {item.sellers?.name ?? "Sem vendedor"} •{" "}
                    {item.whatsapp_connections?.name ?? "Conexão padrão"}
                  </p>
                </div>
                <div className="min-w-[150px]">
                  <p className="text-xs text-muted-foreground">Envio previsto</p>
                  <p>{new Date(item.scheduled_at).toLocaleString("pt-BR")}</p>
                </div>
                <div className="min-w-[140px] space-y-1">
                  {statusBadge(item.status)}
                  {(item.reason || item.error) && (
                    <p className="text-xs text-muted-foreground">{item.reason ?? item.error}</p>
                  )}
                </div>
                {showActions && (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy !== null}
                      onClick={() => void act(item.id, "send_now")}
                    >
                      <Send className="mr-1.5 h-3.5 w-3.5" /> Enviar agora
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setReschedule({ id: item.id, value: toLocalInput(item.scheduled_at) })
                      }
                    >
                      <CalendarClock className="mr-1.5 h-3.5 w-3.5" /> Data
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={busy !== null}
                      onClick={() => void act(item.id, "cancel")}
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" /> Cancelar
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Relacionamento"
        icon={Send}
        title="Follow-up automático"
        description="Regras que enviam mensagens de WhatsApp para seus clientes no momento certo."
        actions={
          <>
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={async () => {
                setBusy("run");
                try {
                  const result = await runNow();
                  toast.success(
                    `Verificação concluída: ${result.created} agendados, ${result.results?.SENT ?? 0} enviados.`,
                  );
                  await refresh();
                } catch (e) {
                  toast.error(getErrorMessage(e, "Falha ao processar."));
                } finally {
                  setBusy(null);
                }
              }}
            >
              {busy === "run" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Processar agora
            </Button>
            <Button onClick={() => openRule()}>
              <Plus className="mr-2 h-4 w-4" /> Nova regra
            </Button>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Agendados hoje", value: stats.today },
          { label: "Pendentes", value: stats.pending },
          { label: "Enviados", value: stats.sent },
          { label: "Falharam", value: stats.failed },
          { label: "Regras ativas", value: stats.activeRules },
        ].map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{card.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <Tabs defaultValue="agendados" className="space-y-4">
          <TabsList>
            <TabsTrigger value="agendados">Agendados</TabsTrigger>
            <TabsTrigger value="enviados">Enviados</TabsTrigger>
            <TabsTrigger value="falharam">Falharam</TabsTrigger>
            <TabsTrigger value="regras">Regras</TabsTrigger>
          </TabsList>
          <TabsContent value="agendados">
            <QueueTable
              items={rows(["SCHEDULED", "PENDING", "PROCESSING", "WAITING_CONNECTION"])}
              showActions
            />
          </TabsContent>
          <TabsContent value="enviados">
            <QueueTable items={rows(["SENT"])} />
          </TabsContent>
          <TabsContent value="falharam">
            <QueueTable items={rows(["FAILED", "CANCELLED", "SKIPPED"])} showActions />
          </TabsContent>
          <TabsContent value="regras" className="space-y-3">
            {(data?.rules ?? []).length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  Nenhuma regra criada ainda.
                </CardContent>
              </Card>
            ) : (
              data?.rules.map((rule) => (
                <Card key={rule.id}>
                  <CardContent className="flex flex-wrap items-center gap-3 py-4">
                    <div className="min-w-[220px] flex-1">
                      <p className="font-medium">{rule.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {triggerLabel(rule.trigger_event)} • aguardar {rule.delay_days} dia(s) •{" "}
                        {(rule.allowed_start ?? "").slice(0, 5)}–
                        {(rule.allowed_end ?? "").slice(0, 5)}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {rule.message}
                      </p>
                    </div>
                    <Badge variant={rule.active ? "default" : "outline"}>
                      {rule.active ? "Ativa" : "Inativa"}
                    </Badge>
                    <Button size="sm" variant="outline" onClick={() => openRule(rule)}>
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      onClick={async () => {
                        try {
                          await deleteRule({ data: { id: rule.id } });
                          toast.success("Regra excluída.");
                          await refresh();
                        } catch (e) {
                          toast.error(getErrorMessage(e, "Falha ao excluir."));
                        }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}

      {/* Regra */}
      <Dialog open={ruleForm !== null} onOpenChange={(open) => !open && setRuleForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{ruleForm?.id ? "Editar regra" : "Nova regra de follow-up"}</DialogTitle>
            <DialogDescription>
              Escolha o que aconteceu, quantos dias esperar e qual mensagem enviar.
            </DialogDescription>
          </DialogHeader>
          {ruleForm && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome da regra</Label>
                <Input
                  value={ruleForm.name}
                  onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })}
                  placeholder="Retorno pós-orçamento"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Quando acontecer</Label>
                  <Select
                    value={ruleForm.triggerEvent}
                    onValueChange={(value) => setRuleForm({ ...ruleForm, triggerEvent: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TRIGGER_EVENTS.map((event) => (
                        <SelectItem key={event.value} value={event.value}>
                          {event.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Esperar (dias)</Label>
                  <Input
                    type="number"
                    min={0}
                    value={ruleForm.delayDays}
                    onChange={(e) =>
                      setRuleForm({ ...ruleForm, delayDays: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qual WhatsApp usar</Label>
                  <Select
                    value={ruleForm.whatsappMode}
                    onValueChange={(value) => setRuleForm({ ...ruleForm, whatsappMode: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="default">Conexão padrão</SelectItem>
                      <SelectItem value="seller">Do vendedor responsável</SelectItem>
                      <SelectItem value="specific">Número específico</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {ruleForm.whatsappMode === "specific" && (
                  <div className="space-y-2">
                    <Label>Conexão</Label>
                    <Select
                      value={ruleForm.connectionId || "none"}
                      onValueChange={(value) =>
                        setRuleForm({ ...ruleForm, connectionId: value === "none" ? "" : value })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Selecionar</SelectItem>
                        {data?.connections.map((connection) => (
                          <SelectItem key={connection.id} value={connection.id}>
                            {connection.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-2">
                  <Label>Responsável (opcional)</Label>
                  <Select
                    value={ruleForm.sellerId || "none"}
                    onValueChange={(value) =>
                      setRuleForm({ ...ruleForm, sellerId: value === "none" ? "" : value })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Vendedor da venda" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Vendedor da venda</SelectItem>
                      {data?.sellers.map((seller) => (
                        <SelectItem key={seller.id} value={seller.id}>
                          {seller.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-2">
                    <Label>Horário de</Label>
                    <Input
                      type="time"
                      value={ruleForm.allowedStart}
                      onChange={(e) => setRuleForm({ ...ruleForm, allowedStart: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>até</Label>
                    <Input
                      type="time"
                      value={ruleForm.allowedEnd}
                      onChange={(e) => setRuleForm({ ...ruleForm, allowedEnd: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Dias da semana</Label>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => {
                    const checked = ruleForm.allowedWeekdays.includes(day.value);
                    return (
                      <Button
                        key={day.value}
                        type="button"
                        size="sm"
                        variant={checked ? "default" : "outline"}
                        onClick={() =>
                          setRuleForm({
                            ...ruleForm,
                            allowedWeekdays: checked
                              ? ruleForm.allowedWeekdays.filter((d) => d !== day.value)
                              : [...ruleForm.allowedWeekdays, day.value].sort(),
                          })
                        }
                      >
                        {day.label}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Ao vencer, o que acontece?</Label>
                <Select
                  value={ruleForm.startWorkflowId || "__message__"}
                  onValueChange={(value) =>
                    setRuleForm({
                      ...ruleForm,
                      startWorkflowId: value === "__message__" ? "" : value,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__message__">Enviar a mensagem abaixo</SelectItem>
                    {workflows.map((workflow) => (
                      <SelectItem key={workflow.id} value={workflow.id}>
                        Iniciar o fluxo: {workflow.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {!ruleForm.startWorkflowId && (
                <div className="space-y-2">
                  <Label>Mensagem</Label>
                  <Textarea
                    value={ruleForm.message}
                    onChange={(e) => setRuleForm({ ...ruleForm, message: e.target.value })}
                    rows={5}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {MESSAGE_VARIABLES.map((variable) => (
                      <Button
                        key={variable}
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          setRuleForm({ ...ruleForm, message: `${ruleForm.message}${variable}` })
                        }
                      >
                        Inserir {variable}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3">
                <Switch
                  checked={ruleForm.active}
                  onCheckedChange={(checked) => setRuleForm({ ...ruleForm, active: checked })}
                />
                <span className="text-sm">{ruleForm.active ? "Regra ativa" : "Regra inativa"}</span>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleForm(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveRule} disabled={busy !== null}>
              {busy === "rule" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar regra
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reagendar */}
      <Dialog open={reschedule !== null} onOpenChange={(open) => !open && setReschedule(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Alterar data do envio</DialogTitle>
          </DialogHeader>
          <Input
            type="datetime-local"
            value={reschedule?.value ?? ""}
            onChange={(e) =>
              setReschedule(reschedule ? { ...reschedule, value: e.target.value } : null)
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReschedule(null)}>
              Cancelar
            </Button>
            <Button
              onClick={async () => {
                if (!reschedule) return;
                setBusy(reschedule.id);
                try {
                  const result = await queueAction({
                    data: {
                      id: reschedule.id,
                      action: "reschedule",
                      scheduledAt: reschedule.value,
                    },
                  });
                  toast.success(result.message);
                  setReschedule(null);
                  await refresh();
                } catch (e) {
                  toast.error(getErrorMessage(e, "Falha ao reagendar."));
                } finally {
                  setBusy(null);
                }
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
