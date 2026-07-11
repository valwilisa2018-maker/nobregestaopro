import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck, Search, Loader2, Plus, X, Crown, User, Ban, CheckCircle2, Trash2, LogIn, Copy } from "lucide-react";
import { useEffect, useState } from "react";
import { MasterGuard } from "@/components/master-guard";
import { PageShell } from "@/components/page-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { masterDeleteUser, masterGenerateAccessLink, masterSetBlocked } from "@/lib/master-users.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";

export const Route = createFileRoute("/master/permissions")({
  head: () => ({ meta: [{ title: "Permissões — Admin Master" }] }),
  component: () => <MasterGuard><Page /></MasterGuard>,
});

type Role = "admin" | "master" | "supervisor" | "atendente" | "viewer";
const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "master", label: "Master", color: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
  { value: "admin", label: "Admin", color: "bg-purple-500/15 text-purple-400 border-purple-500/30" },
  { value: "supervisor", label: "Supervisor", color: "bg-blue-500/15 text-blue-400 border-blue-500/30" },
  { value: "atendente", label: "Atendente", color: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  { value: "viewer", label: "Viewer", color: "bg-muted text-muted-foreground border-border" },
];

type Row = { user_id: string; full_name: string | null; email: string; status: string | null; roles: Role[] };

function Page() {
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [newRole, setNewRole] = useState<Record<string, Role>>({});
  const [accessLink, setAccessLink] = useState<{ email: string; link: string } | null>(null);
  const deleteUser = useServerFn(masterDeleteUser);
  const genLink = useServerFn(masterGenerateAccessLink);
  const setBlocked = useServerFn(masterSetBlocked);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("master_list_users_with_roles", { _search: search || undefined });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function grant(userId: string, role: Role) {
    setBusy(userId + role);
    const { error } = await supabase.rpc("master_grant_role", { _user_id: userId, _role: role });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success(`Papel "${role}" concedido`);
    load();
  }
  async function revoke(userId: string, role: Role) {
    if (!confirm(`Remover papel "${role}" deste usuário?`)) return;
    setBusy(userId + role);
    const { error } = await supabase.rpc("master_revoke_role", { _user_id: userId, _role: role });
    setBusy(null);
    if (error) return toast.error(error.message);
    toast.success("Papel removido");
    load();
  }

  async function toggleBlock(u: Row) {
    const blocking = u.status !== "suspended";
    if (blocking && !confirm(`Bloquear login de ${u.email}?`)) return;
    setBusy(u.user_id + "block");
    try {
      await setBlocked({ data: { userId: u.user_id, blocked: blocking } });
      toast.success(blocking ? "Login bloqueado" : "Login reativado");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(null); }
  }

  async function removeUser(u: Row) {
    if (!confirm(`Excluir DEFINITIVAMENTE a conta ${u.email}? Esta ação não pode ser desfeita.`)) return;
    setBusy(u.user_id + "del");
    try {
      await deleteUser({ data: { userId: u.user_id } });
      toast.success("Conta excluída");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(null); }
  }

  async function impersonate(u: Row) {
    setBusy(u.user_id + "imp");
    try {
      const r = await genLink({ data: { userId: u.user_id } });
      if (!r.action_link) throw new Error("Não foi possível gerar o link");
      setAccessLink({ email: r.email, link: r.action_link });
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(null); }
  }

  return (
    <PageShell
      title="Permissões"
      description="Conceda ou remova papéis (roles) para cada usuário da plataforma."
      icon={<ShieldCheck className="h-6 w-6" />}
    >
      <Card className="border-primary/20">
        <CardContent className="pt-6 space-y-4">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar por e-mail ou nome…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && load()}
              />
            </div>
            <Button onClick={load} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Buscar"}
            </Button>
          </div>

          {loading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm">Nenhum usuário encontrado.</div>
          ) : (
            <div className="space-y-2">
              {rows.map((u) => (
                <div key={u.user_id} className="rounded-lg border border-border/60 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
                      {u.roles.includes("master") ? <Crown className="h-4 w-4" /> : <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium truncate text-sm flex items-center gap-2">
                        {u.full_name || u.email}
                        {u.status === "suspended" && <Badge variant="destructive" className="text-[10px] py-0">bloqueado</Badge>}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {u.roles.length === 0 && <span className="text-xs text-muted-foreground italic">sem papéis</span>}
                    {u.roles.map((r) => {
                      const meta = ROLES.find((x) => x.value === r);
                      return (
                        <Badge key={r} className={`gap-1 ${meta?.color ?? ""}`}>
                          {meta?.label ?? r}
                          <button
                            onClick={() => revoke(u.user_id, r)}
                            disabled={busy === u.user_id + r}
                            className="ml-1 hover:opacity-70"
                            aria-label={`Remover ${r}`}
                          >
                            {busy === u.user_id + r ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
                          </button>
                        </Badge>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={newRole[u.user_id] ?? ""} onValueChange={(v) => setNewRole((s) => ({ ...s, [u.user_id]: v as Role }))}>
                      <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Adicionar…" /></SelectTrigger>
                      <SelectContent>
                        {ROLES.filter((r) => !u.roles.includes(r.value)).map((r) => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!newRole[u.user_id] || busy === u.user_id + newRole[u.user_id]}
                      onClick={() => {
                        const r = newRole[u.user_id];
                        if (r) grant(u.user_id, r);
                      }}
                    >
                      {busy === u.user_id + newRole[u.user_id] ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" title="Acessar conta (magic link)" onClick={() => impersonate(u)} disabled={busy === u.user_id + "imp"}>
                      {busy === u.user_id + "imp" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
                    </Button>
                    <Button size="sm" variant="outline" title={u.status === "suspended" ? "Reativar login" : "Bloquear login"} onClick={() => toggleBlock(u)} disabled={busy === u.user_id + "block"}>
                      {busy === u.user_id + "block" ? <Loader2 className="h-4 w-4 animate-spin" /> : u.status === "suspended" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : <Ban className="h-4 w-4 text-amber-500" />}
                    </Button>
                    <Button size="sm" variant="outline" title="Excluir conta" onClick={() => removeUser(u)} disabled={busy === u.user_id + "del"} className="text-destructive hover:text-destructive">
                      {busy === u.user_id + "del" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-muted-foreground pt-2">
            <strong>Master:</strong> acesso total. <strong>Admin:</strong> gerencia clientes, planos e configurações.
            <strong> Supervisor/Atendente/Viewer:</strong> reservados para permissões futuras por módulo.
          </p>
        </CardContent>
      </Card>

      <Dialog open={!!accessLink} onOpenChange={(v) => !v && setAccessLink(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link de acesso gerado</DialogTitle>
            <DialogDescription>
              Abra o link em uma aba anônima para entrar na conta de <strong>{accessLink?.email}</strong>. O link é de uso único e expira em minutos.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Input readOnly value={accessLink?.link ?? ""} className="text-xs" />
            <Button
              type="button"
              onClick={() => {
                if (accessLink?.link) {
                  navigator.clipboard.writeText(accessLink.link);
                  toast.success("Link copiado");
                }
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccessLink(null)}>Fechar</Button>
            {accessLink?.link && (
              <Button asChild><a href={accessLink.link} target="_blank" rel="noreferrer">Abrir agora</a></Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
