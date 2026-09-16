import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import { RUN_STATUS_LABEL } from "@/lib/workflow-shared";
import {
  workflowCustomerPanel,
  workflowRunAction,
  workflowStartForCustomer,
} from "@/lib/workflow.functions";
import { Loader2, PlayCircle, Workflow as WorkflowIcon, XCircle } from "lucide-react";

type Panel = Awaited<ReturnType<typeof workflowCustomerPanel>>;

export function CustomerWorkflowPanel({ customerId }: { customerId: string }) {
  const loadPanel = useServerFn(workflowCustomerPanel);
  const startRun = useServerFn(workflowStartForCustomer);
  const runAction = useServerFn(workflowRunAction);

  const [data, setData] = useState<Panel | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [workflowId, setWorkflowId] = useState("");
  const [connectionId, setConnectionId] = useState("");

  const refresh = async () => {
    try {
      const result = await loadPanel({ data: { customerId } });
      setData(result);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar os workflows."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const selected = useMemo(
    () => (data?.workflows ?? []).find((w) => w.id === workflowId) ?? null,
    [data, workflowId],
  );

  const connections = useMemo(
    () =>
      (data?.connections ?? []).filter(
        (connection) =>
          !selected?.seller_id || !connection.seller_id || connection.seller_id === selected.seller_id,
      ),
    [data, selected],
  );

  useEffect(() => {
    if (selected?.default_connection_id) setConnectionId(selected.default_connection_id);
  }, [selected]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando workflows...
      </div>
    );
  }

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex items-center gap-2 font-medium">
        <WorkflowIcon className="h-4 w-4 text-primary" /> Workflow
      </div>

      {(data?.workflows ?? []).length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nenhum fluxo ativo disponível. Crie e publique um fluxo no módulo Workflow.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>Iniciar Workflow</Label>
            <Select value={workflowId} onValueChange={setWorkflowId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher fluxo" />
              </SelectTrigger>
              <SelectContent>
                {(data?.workflows ?? []).map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>WhatsApp</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger>
                <SelectValue placeholder="Escolher WhatsApp" />
              </SelectTrigger>
              <SelectContent>
                {connections.map((connection) => (
                  <SelectItem key={connection.id} value={connection.id}>
                    {connection.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Button
              size="sm"
              disabled={busy || !workflowId}
              onClick={async () => {
                setBusy(true);
                try {
                  await startRun({
                    data: { customerId, workflowId, connectionId: connectionId || null },
                  });
                  toast.success("Workflow iniciado.");
                  await refresh();
                } catch (e) {
                  toast.error(getErrorMessage(e, "Não foi possível iniciar o workflow."));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <PlayCircle className="mr-2 h-4 w-4" />
              )}
              Iniciar
            </Button>
          </div>
        </div>
      )}

      <Separator />
      <div className="space-y-2">
        <Label>Etiquetas do cliente</Label>
        <p className="text-xs text-muted-foreground">
          Ao adicionar uma etiqueta, os fluxos com o gatilho dessa etiqueta começam na hora.
        </p>
        <div className="flex flex-wrap gap-2">
          {tags.length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma etiqueta ainda.</span>
          )}
          {tags.map((tag) => (
            <Badge key={tag} variant="secondary" className="gap-1">
              {tag}
              <button
                type="button"
                aria-label={`Remover etiqueta ${tag}`}
                onClick={() => void saveTags(tags.filter((t) => t !== tag))}
                className="text-muted-foreground hover:text-foreground"
              >
                <XCircle className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
        <div className="flex gap-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="cliente-vip"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void addTag();
              }
            }}
          />
          <Button size="sm" variant="outline" disabled={busy || !newTag.trim()} onClick={addTag}>
            <Tag className="mr-2 h-4 w-4" /> Adicionar
          </Button>
        </div>
      </div>


      {(data?.runs ?? []).length > 0 && (
        <>
          <Separator />
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">
              Conversas automáticas deste cliente
            </p>
            {(data?.runs ?? []).map((run) => (
              <div
                key={run.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-2 text-sm"
              >
                <div>
                  <p className="font-medium">
                    {(run as { workflows?: { name?: string } | null }).workflows?.name ?? "Fluxo"}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {(run as { sellers?: { name?: string } | null }).sellers?.name ?? "—"} •{" "}
                    {(run as { whatsapp_connections?: { name?: string } | null })
                      .whatsapp_connections?.name ?? "—"}{" "}
                    • {new Date(run.updated_at).toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={run.status === "FAILED" ? "destructive" : "outline"}>
                    {RUN_STATUS_LABEL[run.status] ?? run.status}
                  </Badge>
                  {!["DONE", "CANCELLED"].includes(run.status) && (
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
            ))}
          </div>
        </>
      )}
    </div>
  );
}
