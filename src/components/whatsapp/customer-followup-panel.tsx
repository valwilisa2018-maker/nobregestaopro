import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
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
import { FOLLOWUP_STATUS_LABEL } from "@/lib/followup-shared";
import {
  whatsappCustomerHistory,
  whatsappSendToCustomer,
  whatsappSetCustomerFollowup,
} from "@/lib/whatsapp.functions";
import { Loader2, MessageCircle, Send } from "lucide-react";

type History = Awaited<ReturnType<typeof whatsappCustomerHistory>>;

export function CustomerFollowupPanel({ customerId }: { customerId: string }) {
  const loadHistory = useServerFn(whatsappCustomerHistory);
  const sendMessage = useServerFn(whatsappSendToCustomer);
  const setFollowup = useServerFn(whatsappSetCustomerFollowup);

  const [data, setData] = useState<History | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [connectionId, setConnectionId] = useState("");
  const [message, setMessage] = useState("");

  const refresh = async () => {
    try {
      const result = await loadHistory({ data: { customerId } });
      setData(result);
      if (!connectionId && result.connections?.[0]) setConnectionId(result.connections[0].id);
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar o histórico."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setLoading(true);
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando WhatsApp / Follow-up...
      </div>
    );
  }

  const enabled = data?.customer?.followup_enabled ?? true;

  return (
    <div className="space-y-4 rounded-xl border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 font-medium">
          <MessageCircle className="h-4 w-4 text-[#25D366]" /> WhatsApp / Follow-up
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Switch
            checked={enabled}
            onCheckedChange={async (checked) => {
              try {
                await setFollowup({ data: { customerId, enabled: checked } });
                toast.success(
                  checked
                    ? "Mensagens automáticas permitidas."
                    : "Mensagens automáticas desativadas para este cliente.",
                );
                await refresh();
              } catch (e) {
                toast.error(getErrorMessage(e, "Não foi possível alterar."));
              }
            }}
          />
          {enabled ? "Permitir mensagens automáticas" : "Não enviar mensagens automáticas"}
        </label>
      </div>

      <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-xs text-muted-foreground">Última interação</p>
          <p>
            {data?.customer?.last_interaction_at
              ? new Date(data.customer.last_interaction_at).toLocaleString("pt-BR")
              : "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Próximo follow-up</p>
          <p>
            {data?.next?.scheduled_at
              ? new Date(data.next.scheduled_at).toLocaleString("pt-BR")
              : "Nenhum agendado"}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Enviados</p>
          <p>{data?.counts?.sent ?? 0}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Cancelados</p>
          <p>{data?.counts?.cancelled ?? 0}</p>
        </div>
      </div>

      <Separator />

      <div className="space-y-2">
        <Label>Enviar mensagem agora</Label>
        <Select value={connectionId} onValueChange={setConnectionId}>
          <SelectTrigger>
            <SelectValue placeholder="Escolher WhatsApp" />
          </SelectTrigger>
          <SelectContent>
            {(data?.connections ?? []).map((connection) => (
              <SelectItem key={connection.id} value={connection.id}>
                {connection.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Escreva a mensagem..."
        />
        <Button
          size="sm"
          disabled={busy || !message.trim() || !connectionId}
          onClick={async () => {
            setBusy(true);
            try {
              await sendMessage({ data: { customerId, connectionId, message } });
              setMessage("");
              toast.success("Mensagem enviada.");
              await refresh();
            } catch (e) {
              toast.error(getErrorMessage(e, "Falha no envio."));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Send className="mr-2 h-4 w-4" />
          )}
          Enviar
        </Button>
      </div>

      {(data?.messages ?? []).length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Últimas mensagens</p>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {data?.messages.map((item) => (
              <div
                key={item.id}
                className={`rounded-lg p-2 text-sm ${
                  item.direction === "out" ? "bg-primary/10" : "bg-background border"
                }`}
              >
                <p>{item.body}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {item.direction === "out" ? "Enviada" : "Recebida"} •{" "}
                  {new Date(item.created_at).toLocaleString("pt-BR")}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {(data?.queue ?? []).length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground">Follow-ups deste cliente</p>
          {data?.queue.map((item) => (
            <div key={item.id} className="flex items-center gap-2 text-xs">
              <Badge variant="outline">{FOLLOWUP_STATUS_LABEL[item.status] ?? item.status}</Badge>
              <span>{new Date(item.scheduled_at).toLocaleString("pt-BR")}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
