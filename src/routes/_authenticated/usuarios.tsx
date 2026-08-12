/* eslint-disable @typescript-eslint/no-explicit-any */
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Copy, Loader2, MailPlus, Pencil, RefreshCw, UserCheck, UserX } from "lucide-react";
import { toast } from "sonner";
import { PageHero } from "@/components/page-hero";
import { PermissionEditor } from "@/components/permission-editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  createInvitation,
  listAccessAdmin,
  setUserStatus,
  updateInvitation,
  updateUserAccess,
} from "@/lib/access.functions";
import { normalizePermissions, type PermissionMap } from "@/lib/access-control";
import { useAccess } from "@/components/access-provider";

export const Route = createFileRoute("/_authenticated/usuarios")({ component: UsersAccessPage });

type EditorState =
  | { kind: "invite"; name: string; email: string; jobTitle: string; permissions: PermissionMap }
  | { kind: "user"; id: string; name: string; jobTitle: string; permissions: PermissionMap }
  | { kind: "pending"; id: string; name: string; jobTitle: string; permissions: PermissionMap };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Não foi possível concluir a operação.";
}
function invitationUrl(token: string) {
  return `${window.location.origin}/aceitar-convite?token=${encodeURIComponent(token)}`;
}
async function copyInvite(token: string) {
  await navigator.clipboard.writeText(invitationUrl(token));
  toast.success("Link do convite copiado.");
}

function UsersAccessPage() {
  const access = useAccess();
  const queryClient = useQueryClient();
  const [editor, setEditor] = useState<EditorState | null>(null);
  const query = useQuery({
    queryKey: ["access-admin"],
    queryFn: () => listAccessAdmin(),
    enabled: access.isAdmin,
    retry: false,
  });
  const data = query.data as any;
  const permissionsByUser = useMemo(() => {
    const grouped: Record<string, any> = {};
    for (const row of data?.permissions ?? [])
      grouped[row.user_id] = {
        ...(grouped[row.user_id] ?? {}),
        [row.module]: {
          view: row.can_view,
          create: row.can_create,
          edit: row.can_edit,
          delete: row.can_delete,
        },
      };
    return grouped;
  }, [data?.permissions]);
  const adminIds = new Set(
    (data?.roles ?? []).filter((row: any) => row.role === "admin").map((row: any) => row.user_id),
  );

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["access-admin"] });
  const saveMutation = useMutation({
    mutationFn: async (state: EditorState) => {
      if (state.kind === "invite")
        return createInvitation({
          data: {
            name: state.name,
            email: state.email,
            jobTitle: state.jobTitle,
            permissions: state.permissions,
          },
        });
      if (state.kind === "user")
        return updateUserAccess({
          data: { userId: state.id, jobTitle: state.jobTitle, permissions: state.permissions },
        });
      return updateInvitation({
        data: { id: state.id, action: "permissions", permissions: state.permissions },
      });
    },
    onSuccess: async (result: any, state) => {
      setEditor(null);
      refresh();
      if (state.kind === "invite") {
        await copyInvite(result.token);
      } else toast.success("Permissões atualizadas.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const statusMutation = useMutation({
    mutationFn: (input: { userId: string; status: "active" | "inactive" }) =>
      setUserStatus({ data: input }),
    onSuccess: () => {
      toast.success("Status atualizado.");
      refresh();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const inviteMutation = useMutation({
    mutationFn: (input: { id: string; action: "revoke" | "renew" }) =>
      updateInvitation({ data: input }),
    onSuccess: async (result: any, input) => {
      refresh();
      if (input.action === "renew" && result.token) await copyInvite(result.token);
      else toast.success("Convite revogado.");
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  if (!access.isAdmin)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Acesso negado</CardTitle>
          <CardDescription>Somente administradores podem gerenciar usuários.</CardDescription>
        </CardHeader>
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Administração"
        title="Usuários e Permissões"
        description="Convide pessoas e defina exatamente o que cada uma pode acessar."
        actions={
          <Button
            onClick={() =>
              setEditor({
                kind: "invite",
                name: "",
                email: "",
                jobTitle: "",
                permissions: normalizePermissions({}),
              })
            }
          >
            <MailPlus className="mr-2 h-4 w-4" />
            Novo convite
          </Button>
        }
      />
      {query.isLoading ? (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Não foi possível carregar</CardTitle>
            <CardDescription>{errorMessage(query.error)}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => query.refetch()}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="users">
          <TabsList>
            <TabsTrigger value="users">Usuários ({data?.profiles?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="invites">
              Convites (
              {(data?.invitations ?? []).filter((row: any) => row.status === "pending").length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Cargo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.profiles ?? []).map((profile: any) => {
                      const master = adminIds.has(profile.id);
                      return (
                        <TableRow key={profile.id}>
                          <TableCell>
                            <div className="font-medium">{profile.full_name || "Sem nome"}</div>
                            <div className="text-xs text-muted-foreground">{profile.email}</div>
                          </TableCell>
                          <TableCell>{profile.job_title || "—"}</TableCell>
                          <TableCell>
                            <Badge variant={profile.status === "active" ? "default" : "secondary"}>
                              {profile.status === "active" ? "Ativo" : "Inativo"}
                            </Badge>
                            {master && (
                              <Badge variant="outline" className="ml-2">
                                Admin
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={master}
                                onClick={() =>
                                  setEditor({
                                    kind: "user",
                                    id: profile.id,
                                    name: profile.full_name || profile.email,
                                    jobTitle: profile.job_title || "",
                                    permissions: normalizePermissions(
                                      permissionsByUser[profile.id] ?? {},
                                    ),
                                  })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                                <span className="sr-only">Editar</span>
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={master || statusMutation.isPending}
                                onClick={() =>
                                  statusMutation.mutate({
                                    userId: profile.id,
                                    status: profile.status === "active" ? "inactive" : "active",
                                  })
                                }
                              >
                                {profile.status === "active" ? (
                                  <UserX className="h-4 w-4" />
                                ) : (
                                  <UserCheck className="h-4 w-4" />
                                )}
                                <span className="sr-only">Alterar status</span>
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="invites" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Convidado</TableHead>
                      <TableHead>Validade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(data?.invitations ?? []).map((inv: any) => (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <div className="font-medium">{inv.name}</div>
                          <div className="text-xs text-muted-foreground">{inv.email}</div>
                        </TableCell>
                        <TableCell>
                          {new Date(inv.expires_at).toLocaleDateString("pt-BR")}
                        </TableCell>
                        <TableCell>
                          <Badge variant={inv.status === "pending" ? "default" : "secondary"}>
                            {(
                              {
                                pending: "Pendente",
                                accepted: "Aceito",
                                expired: "Expirado",
                                revoked: "Revogado",
                              } as any
                            )[inv.status] ?? inv.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {inv.status === "pending" && (
                            <div className="flex justify-end gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setEditor({
                                    kind: "pending",
                                    id: inv.id,
                                    name: inv.name,
                                    jobTitle: inv.job_title || "",
                                    permissions: normalizePermissions(inv.permissions),
                                  })
                                }
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                title="Gerar novo link"
                                onClick={() =>
                                  inviteMutation.mutate({ id: inv.id, action: "renew" })
                                }
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() =>
                                  inviteMutation.mutate({ id: inv.id, action: "revoke" })
                                }
                              >
                                Revogar
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
      <Dialog open={Boolean(editor)} onOpenChange={(open) => !open && setEditor(null)}>
        <DialogContent className="max-w-4xl">
          {editor && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {editor.kind === "invite" ? "Novo convite" : `Permissões de ${editor.name}`}
                </DialogTitle>
                <DialogDescription>
                  Marcar uma ação também habilita a visualização do módulo.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {editor.kind === "invite" && (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="invite-name">Nome</Label>
                      <Input
                        id="invite-name"
                        value={editor.name}
                        onChange={(e) => setEditor({ ...editor, name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="invite-email">E-mail</Label>
                      <Input
                        id="invite-email"
                        type="email"
                        value={editor.email}
                        onChange={(e) => setEditor({ ...editor, email: e.target.value })}
                      />
                    </div>
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="job-title">Cargo</Label>
                  <Input
                    id="job-title"
                    value={editor.jobTitle}
                    onChange={(e) => setEditor({ ...editor, jobTitle: e.target.value })}
                    disabled={editor.kind === "pending"}
                  />
                </div>
                <PermissionEditor
                  value={editor.permissions}
                  onChange={(permissions) => setEditor({ ...editor, permissions })}
                  disabled={saveMutation.isPending}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEditor(null)}>
                  Cancelar
                </Button>
                <Button
                  disabled={
                    saveMutation.isPending ||
                    (editor.kind === "invite" && (!editor.name.trim() || !editor.email.trim()))
                  }
                  onClick={() => saveMutation.mutate(editor)}
                >
                  {saveMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Salvar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
