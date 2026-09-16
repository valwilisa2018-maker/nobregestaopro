import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { PageHero } from "@/components/page-hero";
import { EvolutionSettingsCard } from "@/components/whatsapp/evolution-settings-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "@/lib/toast";
import { getErrorMessage } from "@/lib/error-messages";
import { stateLabel } from "@/lib/followup-shared";
import { formatPhoneBR } from "@/lib/phone";
import {
  whatsappCreateConnection,
  whatsappDeleteConnection,
  whatsappDisconnect,
  whatsappGetQr,
  whatsappListConnections,
  whatsappRefreshStatus,
  whatsappUpdateConnection,
} from "@/lib/whatsapp.functions";
import { QRCodeSVG } from "qrcode.react";
import {
  Loader2,
  LogOut,
  Plus,
  QrCode,
  RefreshCw,
  Settings2,
  Smartphone,
  Trash2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/whatsapp")({
  component: WhatsAppPage,
  head: () => ({
    meta: [
      { title: "Conectar WhatsApp | Nobre Gestão" },
      {
        name: "description",
        content:
          "Conecte vários números de WhatsApp à plataforma pela Evolution API e acompanhe o status de cada conexão.",
      },
      { property: "og:title", content: "Conectar WhatsApp | Nobre Gestão" },
      {
        property: "og:description",
        content: "Gerencie as conexões de WhatsApp da sua equipe em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

type Data = Awaited<ReturnType<typeof whatsappListConnections>>;
type Connection = Data["connections"][number];

function qrImage(qr: string | null) {
  if (!qr) return null;
  if (qr.startsWith("data:image")) return qr;
  if (qr.startsWith("iVBOR") || qr.startsWith("/9j/")) return `data:image/png;base64,${qr}`;
  return null;
}

function StateBadge({ state }: { state?: string | null }) {
  const info = stateLabel(state);
  const variant =
    state === "connected" ? "default" : state === "error" ? "destructive" : "secondary";
  return (
    <Badge variant={variant} className="gap-1">
      <span>{info.emoji}</span> {info.label}
    </Badge>
  );
}

function WhatsAppPage() {
  const list = useServerFn(whatsappListConnections);
  const createConnection = useServerFn(whatsappCreateConnection);
  const getQr = useServerFn(whatsappGetQr);
  const refreshStatus = useServerFn(whatsappRefreshStatus);
  const updateConnection = useServerFn(whatsappUpdateConnection);
  const disconnect = useServerFn(whatsappDisconnect);
  const removeConnection = useServerFn(whatsappDeleteConnection);

  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    responsibleName: "",
    sellerId: "",
    instanceName: "",
    notes: "",
  });
  const [qrTarget, setQrTarget] = useState<{ instanceName: string; name: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<Connection | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = async () => {
    try {
      setData(await list());
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível carregar as conexões."));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Enquanto o QR Code está aberto, verifica o status sozinho.
  useEffect(() => {
    if (!qrTarget) {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const result = await refreshStatus({ data: { instanceName: qrTarget.instanceName } });
        const state = result.results?.[0]?.state;
        if (state === "connected") {
          toast.success("WhatsApp conectado com sucesso!");
          setQrTarget(null);
          setQr(null);
          await refresh();
        }
      } catch {
        // silencioso: tenta de novo no próximo ciclo
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qrTarget]);

  const openQr = async (connection: { instance_name: string; name: string }) => {
    setQrTarget({ instanceName: connection.instance_name, name: connection.name });
    setQr(null);
    try {
      const result = await getQr({ data: { instanceName: connection.instance_name } });
      setQr(result.qr);
      if (!result.qr) toast.info("A Evolution API ainda não devolveu o QR Code. Tente novamente.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível gerar o QR Code."));
    }
  };

  const handleCreate = async () => {
    setBusy("create");
    try {
      const result = await createConnection({
        data: {
          name: form.name,
          responsibleName: form.responsibleName,
          sellerId: form.sellerId || null,
          instanceName: form.instanceName,
          notes: form.notes,
        },
      });
      setCreateOpen(false);
      setForm({ name: "", responsibleName: "", sellerId: "", instanceName: "", notes: "" });
      await refresh();
      if (result.qr) {
        setQrTarget({ instanceName: result.instanceName, name: form.name });
        setQr(result.qr);
      } else {
        await openQr({ instance_name: result.instanceName, name: form.name });
      }
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível criar a conexão."));
    } finally {
      setBusy(null);
    }
  };

  const handleRefreshAll = async () => {
    setBusy("refresh");
    try {
      await refreshStatus({ data: {} });
      await refresh();
      toast.success("Status atualizado.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível atualizar."));
    } finally {
      setBusy(null);
    }
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    setBusy("edit");
    try {
      await updateConnection({
        data: {
          id: editTarget.id,
          name: editTarget.name,
          responsibleName: editTarget.responsible_name,
          sellerId: editTarget.seller_id,
          notes: editTarget.notes,
          isDefault: editTarget.is_default,
        },
      });
      setEditTarget(null);
      await refresh();
      toast.success("Conexão atualizada.");
    } catch (e) {
      toast.error(getErrorMessage(e, "Não foi possível salvar."));
    } finally {
      setBusy(null);
    }
  };

  const configured = data?.configured ?? false;
  const image = qrImage(qr);

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Integração"
        icon={Smartphone}
        title="Conectar WhatsApp"
        description="Conecte quantos números precisar e acompanhe o status de cada um."
        actions={
          <>
            <Button variant="outline" onClick={handleRefreshAll} disabled={busy !== null}>
              {busy === "refresh" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              Atualizar status
            </Button>
            <Button onClick={() => setCreateOpen(true)} disabled={!configured}>
              <Plus className="mr-2 h-4 w-4" /> Conectar novo WhatsApp
            </Button>
          </>
        }
      />

      <Tabs defaultValue="conexoes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="conexoes">WhatsApps conectados</TabsTrigger>
          <TabsTrigger value="config">
            <Settings2 className="mr-2 h-4 w-4" /> Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexoes" className="space-y-4">
          {!loading && !configured && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle>Configure a Evolution API primeiro</CardTitle>
                <CardDescription>
                  Antes de conectar seu WhatsApp, precisamos configurar a comunicação com a
                  Evolution API.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Abra a aba <strong>Configurações</strong> aqui em cima para informar a URL e a API
                  Key.
                </p>
              </CardContent>
            </Card>
          )}

          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando conexões...
            </div>
          ) : (data?.connections.length ?? 0) === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhum WhatsApp conectado ainda.
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {data?.connections.map((connection) => (
                <Card key={connection.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      {connection.profile_pic_url ? (
                        <img
                          src={connection.profile_pic_url}
                          alt={`Foto do perfil de ${connection.name}`}
                          className="h-11 w-11 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                          <Smartphone className="h-5 w-5 text-primary" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <CardTitle className="truncate text-base">{connection.name}</CardTitle>
                        <CardDescription className="truncate">
                          {connection.responsible_name ?? "Sem responsável"}
                        </CardDescription>
                      </div>
                      {connection.is_default && <Badge variant="outline">Padrão</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <StateBadge state={connection.state} />
                    <div className="space-y-1 text-muted-foreground">
                      <p>Número: {connection.phone_number ? formatPhoneBR(connection.phone_number) : "—"}</p>
                      <p>
                        Conectado em:{" "}
                        {connection.connected_at
                          ? new Date(connection.connected_at).toLocaleString("pt-BR")
                          : "—"}
                      </p>
                      <details>
                        <summary className="cursor-pointer text-xs">Ver detalhes</summary>
                        <p className="mt-1 text-xs">Instância: {connection.instance_name}</p>
                        <p className="text-xs">Último evento: {connection.last_event ?? "—"}</p>
                        {connection.notes && <p className="text-xs">Obs.: {connection.notes}</p>}
                      </details>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button size="sm" variant="outline" onClick={() => void openQr(connection)}>
                        <QrCode className="mr-1.5 h-3.5 w-3.5" /> QR Code
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          await refreshStatus({ data: { instanceName: connection.instance_name } });
                          await refresh();
                        }}
                      >
                        <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Status
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditTarget(connection)}>
                        <Settings2 className="mr-1.5 h-3.5 w-3.5" /> Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          try {
                            await disconnect({ data: { instanceName: connection.instance_name } });
                            await refresh();
                            toast.success("WhatsApp desconectado.");
                          } catch (e) {
                            toast.error(getErrorMessage(e, "Falha ao desconectar."));
                          }
                        }}
                      >
                        <LogOut className="mr-1.5 h-3.5 w-3.5" /> Desconectar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() => setDeleteTarget(connection)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Excluir
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="config">
          <EvolutionSettingsCard />
        </TabsContent>
      </Tabs>

      {/* Nova conexão */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Conectar novo WhatsApp</DialogTitle>
            <DialogDescription>Informe os dados da conexão.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="conn-name">Nome da conexão</Label>
              <Input
                id="conn-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="WhatsApp Rogério"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-resp">Nome do vendedor/responsável</Label>
              <Input
                id="conn-resp"
                value={form.responsibleName}
                onChange={(e) => setForm({ ...form, responsibleName: e.target.value })}
                placeholder="Rogério"
              />
            </div>
            <div className="space-y-2">
              <Label>Vendedor cadastrado (opcional)</Label>
              <Select
                value={form.sellerId || "none"}
                onValueChange={(value) => setForm({ ...form, sellerId: value === "none" ? "" : value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar vendedor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem vínculo</SelectItem>
                  {data?.sellers.map((seller) => (
                    <SelectItem key={seller.id} value={seller.id}>
                      {seller.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-instance">Nome interno da instância</Label>
              <Input
                id="conn-instance"
                value={form.instanceName}
                onChange={(e) => setForm({ ...form, instanceName: e.target.value })}
                placeholder="rogerio-vendas"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="conn-notes">Observação (opcional)</Label>
              <Textarea
                id="conn-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleCreate} disabled={busy !== null || !form.name.trim()}>
              {busy === "create" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Criar e gerar QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* QR Code */}
      <Dialog
        open={qrTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setQrTarget(null);
            setQr(null);
            void refresh();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Ler o QR Code — {qrTarget?.name}</DialogTitle>
            <DialogDescription>
              Abra o WhatsApp no celular, entre em “Aparelhos conectados”, clique em “Conectar um
              aparelho” e leia o código abaixo. Aguarde a confirmação — a tela atualiza sozinha.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {!qr ? (
              <div className="flex h-56 items-center gap-2 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Gerando QR Code...
              </div>
            ) : image ? (
              <img src={image} alt="QR Code do WhatsApp" className="h-56 w-56" />
            ) : (
              <div className="rounded-lg bg-white p-3">
                <QRCodeSVG value={qr} size={220} />
              </div>
            )}
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Abra o WhatsApp no celular.</li>
              <li>Entre em “Aparelhos conectados”.</li>
              <li>Clique em “Conectar um aparelho”.</li>
              <li>Leia o QR Code acima.</li>
              <li>Aguarde a confirmação da conexão.</li>
            </ol>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => qrTarget && void openQr({ instance_name: qrTarget.instanceName, name: qrTarget.name })}
            >
              Gerar novo QR Code
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar conexão */}
      <Dialog open={editTarget !== null} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar conexão</DialogTitle>
          </DialogHeader>
          {editTarget && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nome da conexão</Label>
                <Input
                  value={editTarget.name}
                  onChange={(e) => setEditTarget({ ...editTarget, name: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Responsável</Label>
                <Input
                  value={editTarget.responsible_name ?? ""}
                  onChange={(e) =>
                    setEditTarget({ ...editTarget, responsible_name: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Vendedor cadastrado</Label>
                <Select
                  value={editTarget.seller_id ?? "none"}
                  onValueChange={(value) =>
                    setEditTarget({ ...editTarget, seller_id: value === "none" ? null : value })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem vínculo</SelectItem>
                    {data?.sellers.map((seller) => (
                      <SelectItem key={seller.id} value={seller.id}>
                        {seller.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={editTarget.notes ?? ""}
                  onChange={(e) => setEditTarget({ ...editTarget, notes: e.target.value })}
                  rows={2}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editTarget.is_default}
                  onChange={(e) => setEditTarget({ ...editTarget, is_default: e.target.checked })}
                />
                Usar como conexão padrão dos follow-ups
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} disabled={busy !== null}>
              {busy === "edit" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Excluir */}
      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta conexão?</AlertDialogTitle>
            <AlertDialogDescription>
              O número será desconectado e removido da plataforma. Seus clientes, vendas e histórico
              de follow-up continuam intactos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteTarget) return;
                try {
                  await removeConnection({
                    data: { id: deleteTarget.id, instanceName: deleteTarget.instance_name },
                  });
                  toast.success("Conexão excluída.");
                  await refresh();
                } catch (e) {
                  toast.error(getErrorMessage(e, "Falha ao excluir."));
                } finally {
                  setDeleteTarget(null);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
