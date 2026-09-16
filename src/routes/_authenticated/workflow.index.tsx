import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHero } from "@/components/page-hero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import {
  RUN_STATUS_LABEL,
  VISIBILITY_LABEL,
  WORKFLOW_KINDS,
  WORKFLOW_STATUS_LABEL,
} from "@/lib/workflow-shared";
import {
  workflowDelete,
  workflowDuplicate,
  workflowOverview,
  workflowSave,
  workflowSetStatus,
} from "@/lib/workflow.functions";
import {
  Copy,
  Loader2,
  PauseCircle,
  PlayCircle,
  Plus,
  Settings2,
  Trash2,
  Workflow as WorkflowIcon,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/workflow/")({
  component: WorkflowListPage,
  head: () => ({
    meta: [
      { title: "Workflow por vendedor | Nobre Gestão" },
      {
        name: "description",
        content:
          "Cada vendedor cria e acompanha seus próprios fluxos de conversa no WhatsApp, com execuções isoladas.",
      },
      { property: "og:title", content: "Workflow por vendedor | Nobre Gestão" },
      {
        property: "og:description",
        content: "Fluxos de conversa automáticos por vendedor, integrados ao WhatsApp.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof workflowOverview>>;
type Filter = "mine" | "all" | "shared" | "templates";

const emptyForm = {
  id: undefined as string | undefined,
  name: "",
  description: "",
  kind: "comercial",
  sellerId: "",
  defaultConnectionId: "",
  visibility: "private",
  isTemplate: false,
};

function WorkflowListPage() {
  const load = useServerFn(workflowOverview);
  const save = useServerFn(workflowSave);
  const setStatus = useServerFn(workflowSetStatus);
  const duplicate = useServerFn(workflowDuplicate);
  const remove = useServerFn(workflowDelete);
  const navigate = useNavigate();

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("mine");
  const [sellerFilter, setSellerFilter] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);

  const refresh = async (nextFilter = filter, nextSeller = sellerFilter) => {
    try {
      const result = await load({
        data: { filter: nextFilter, sellerId: nextSeller || null },
      });
      setData(result);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar os workflows."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh(filter, sellerFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, sellerFilter]);

  const stats = useMemo(() => {
    const runs = data?.runs ?? [];
    const count = (status: string) => runs.filter((r) => r.status === status).length;
    return {
      active: (data?.workflows ?? []).filter((w) => w.status === "active").length,
      running: count("RUNNING") + count("WAITING_TIME"),
      waiting: count("WAITING_REPLY"),
      handoff: count("HANDOFF"),
      done: count("DONE"),
      failed: count("FAILED"),
    };
  }, [data]);

  const myConnections = useMemo(() => {
    const sellerId = form.sellerId || data?.me.sellerId || null;
    return (data?.connections ?? []).filter(
      (connection) => !connection.seller_id || connection.seller_id === sellerId,
    );
  }, [data, form.sellerId]);

  const openCreate = () => {
    setForm({ ...emptyForm, sellerId: data?.me.sellerId ?? "" });
    setOpen(true);
  };

  const submit = async () => {
    setBusy(true);
    try {
      const result = await save({
        data: {
          id: form.id,
          name: form.name,
          description: form.description,
          kind: form.kind,
          sellerId: form.sellerId || null,
          defaultConnectionId: form.defaultConnectionId || null,
          visibility: form.visibility,
          isTemplate: form.isTemplate,
        },
      });
      setOpen(false);
      toast.success("Workflow salvo.");
      if (!form.id) {
        void navigate({ to: "/workflow/$workflowId", params: { workflowId: result.id } });
        return;
      }
      await refresh();
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Automação"
        icon={WorkflowIcon}
        title="Workflow"
        description="Cada vendedor cria seus próprios fluxos de conversa, com o WhatsApp dele e execuções separadas."
        actions={
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" /> Criar Workflow
          </Button>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Fluxos ativos", value: stats.active },
          { label: "Conversas em andamento", value: stats.running },
          { label: "Aguardando resposta", value: stats.waiting },
          { label: "Encaminhados", value: stats.handoff },
          { label: "Concluídos", value: stats.done },
          { label: "Com erro", value: stats.failed },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="text-2xl font-semibold">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
          <TabsList>
            <TabsTrigger value="mine">Meus workflows</TabsTrigger>
            {data?.me.manager && <TabsTrigger value="all">Todos</TabsTrigger>}
            <TabsTrigger value="shared">Compartilhados comigo</TabsTrigger>
            <TabsTrigger value="templates">Modelos da empresa</TabsTrigger>
          </TabsList>
        </Tabs>
        {data?.me.manager && filter === "all" && (
          <Select
            value={sellerFilter || "todos"}
            onValueChange={(value) => setSellerFilter(value === "todos" ? "" : value)}
          >
            <SelectTrigger className="w-56">
              <SelectValue placeholder="Filtrar por vendedor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os vendedores</SelectItem>
              {(data?.sellers ?? []).map((seller) => (
                <SelectItem key={seller.id} value={seller.id}>
                  {seller.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando workflows...
        </div>
      ) : (data?.workflows ?? []).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-sm text-muted-foreground">
            Nenhum workflow aqui ainda. Clique em “Criar Workflow” para montar o seu primeiro fluxo.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {(data?.workflows ?? []).map((workflow) => {
            const mine = workflow.owner_user_id === data?.me.userId;
            return (
              <Card key={workflow.id}>
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{workflow.name}</CardTitle>
                      <CardDescription>
                        {workflow.description || "Sem descrição"}
                      </CardDescription>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={workflow.status === "active" ? "default" : "outline"}>
                        {WORKFLOW_STATUS_LABEL[workflow.status] ?? workflow.status}
                      </Badge>
                      <Badge variant="outline">
                        {VISIBILITY_LABEL[workflow.visibility] ?? workflow.visibility}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Responsável</p>
                      <p>
                        {(workflow as { sellers?: { name?: string } | null }).sellers?.name ??
                          workflow.seller_name_snapshot ??
                          "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">WhatsApp do fluxo</p>
                      <p>
                        {(workflow as { whatsapp_connections?: { name?: string } | null })
                          .whatsapp_connections?.name ?? "Não escolhido"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Criado em</p>
                      <p>{new Date(workflow.created_at).toLocaleDateString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {(mine || data?.me.manager) && (
                      <Button asChild size="sm" variant="outline">
                        <Link to="/workflow/$workflowId" params={{ workflowId: workflow.id }}>
                          <Settings2 className="mr-2 h-4 w-4" /> Abrir fluxo
                        </Link>
                      </Button>
                    )}
                    {(mine || data?.me.manager) && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await setStatus({
                              data: {
                                id: workflow.id,
                                status: workflow.status === "active" ? "paused" : "active",
                              },
                            });
                            toast.success("Status atualizado.");
                            await refresh();
                          } catch (e) {
                            toast.error(getErrorMessage(e, "Não foi possível alterar o status."));
                          }
                        }}
                      >
                        {workflow.status === "active" ? (
                          <>
                            <PauseCircle className="mr-2 h-4 w-4" /> Pausar
                          </>
                        ) : (
                          <>
                            <PlayCircle className="mr-2 h-4 w-4" /> Ativar
                          </>
                        )}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        try {
                          const result = await duplicate({ data: { id: workflow.id } });
                          toast.success("Cópia criada nos seus workflows.");
                          void navigate({
                            to: "/workflow/$workflowId",
                            params: { workflowId: result.id },
                          });
                        } catch (e) {
                          toast.error(getErrorMessage(e, "Não foi possível duplicar."));
                        }
                      }}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      {workflow.is_template ? "Usar modelo" : "Duplicar para meus workflows"}
                    </Button>
                    {(mine || data?.me.manager) && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm(`Excluir o workflow "${workflow.name}"?`)) return;
                          try {
                            await remove({ data: { id: workflow.id } });
                            toast.success("Workflow excluído.");
                            await refresh();
                          } catch (e) {
                            toast.error(getErrorMessage(e, "Não foi possível excluir."));
                          }
                        }}
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Excluir
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversas</CardTitle>
          <CardDescription>
            {data?.me.manager
              ? "Execuções da equipe, separadas por vendedor."
              : "Somente as suas execuções aparecem aqui."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {(data?.runs ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma conversa automática ainda.</p>
          ) : (
            (data?.runs ?? []).slice(0, 30).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {(run as { customers?: { name?: string } | null }).customers?.name ?? "Cliente"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(run as { workflows?: { name?: string } | null }).workflows?.name} •{" "}
                    {(run as { sellers?: { name?: string } | null }).sellers?.name ?? "—"} •{" "}
                    {(run as { whatsapp_connections?: { name?: string } | null })
                      .whatsapp_connections?.name ?? "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>
                    {RUN_STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {new Date(run.updated_at).toLocaleString("pt-BR")}
                  </span>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Criar Workflow</DialogTitle>
            <DialogDescription>
              O fluxo pertence a você e envia mensagens pelo WhatsApp escolhido aqui.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Nome</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Fluxo de novos clientes"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Responsável</Label>
                <Select
                  value={form.sellerId || "sem"}
                  onValueChange={(value) =>
                    setForm({ ...form, sellerId: value === "sem" ? "" : value })
                  }
                  disabled={!data?.me.manager}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Escolher vendedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sem">Sem vendedor vinculado</SelectItem>
                    {(data?.sellers ?? []).map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>
                        {seller.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select
                  value={form.kind}
                  onValueChange={(value) => setForm({ ...form, kind: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WORKFLOW_KINDS.map((kind) => (
                      <SelectItem key={kind.value} value={kind.value}>
                        {kind.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>WhatsApp padrão</Label>
              <Select
                value={form.defaultConnectionId || "sem"}
                onValueChange={(value) =>
                  setForm({ ...form, defaultConnectionId: value === "sem" ? "" : value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher WhatsApp" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sem">Escolher depois</SelectItem>
                  {myConnections.map((connection) => (
                    <SelectItem key={connection.id} value={connection.id}>
                      {connection.name}
                      {connection.phone_number ? ` — ${connection.phone_number}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Fluxo utilizado para novos leads."
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Visibilidade</Label>
                <Select
                  value={form.visibility}
                  onValueChange={(value) => setForm({ ...form, visibility: value })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="private">Privado</SelectItem>
                    <SelectItem value="shared">Compartilhado (outros podem ver/copiar)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {data?.me.manager && (
                <div className="flex items-end">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={form.isTemplate}
                      onChange={(e) => setForm({ ...form, isTemplate: e.target.checked })}
                    />
                    Salvar como modelo da empresa
                  </label>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button disabled={busy || !form.name.trim()} onClick={submit}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
