import { createFileRoute } from "@tanstack/react-router";
import { Code2, Plus, Trash2, Ban, Copy, Loader2, Inbox, KeyRound } from "lucide-react";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { createApiKey, revokeApiKey, deleteApiKey } from "@/lib/api-keys.functions";
import { MasterGuard } from "@/components/master-guard";

export const Route = createFileRoute("/_authenticated/api")({
  head: () => ({ meta: [{ title: "API — Plataforma IA WhatsApp" }] }),
  component: () => <MasterGuard><Page /></MasterGuard>,
});

type KeyRow = {
  id: string; name: string; key_prefix: string;
  created_at: string; last_used_at: string | null; revoked_at: string | null;
  scopes: string[];
};

function Page() {
  const { user } = useAuth();
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);
  const createFn = useServerFn(createApiKey);
  const revokeFn = useServerFn(revokeApiKey);
  const deleteFn = useServerFn(deleteApiKey);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase.from("api_keys").select("*").eq("user_id", user.id).order("created_at", { ascending: false });
    setLoading(false);
    if (error) return toast.error(error.message);
    setRows((data ?? []) as KeyRow[]);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [user]);

  const create = async () => {
    if (!name.trim()) return toast.error("Informe um nome");
    setSaving(true);
    try {
      const res = await createFn({ data: { name: name.trim() } });
      setNewKey(res.key);
      setName("");
      setOpen(false);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar");
    } finally { setSaving(false); }
  };

  const revoke = async (id: string) => {
    if (!confirm("Revogar esta chave? Deixará de funcionar imediatamente.")) return;
    try { await revokeFn({ data: { id } }); toast.success("Revogada"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };
  const remove = async (id: string) => {
    if (!confirm("Excluir permanentemente esta chave?")) return;
    try { await deleteFn({ data: { id } }); toast.success("Excluída"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };
  const copy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    toast.success("Copiado");
  };

  return (
    <PageShell
      title="Chaves API"
      description="Chaves para autenticar integrações externas."
      icon={<Code2 className="h-6 w-6" />}
      status="ativo"
      actions={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Nova Chave</Button>}
    >
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center space-y-3">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary"><Inbox className="h-6 w-6" /></div>
              <p className="text-muted-foreground">Nenhuma chave criada.</p>
              <Button onClick={() => setOpen(true)} variant="outline"><Plus className="h-4 w-4" /> Criar primeira</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Nome</th>
                    <th className="px-4 py-3 font-medium">Prefixo</th>
                    <th className="px-4 py-3 font-medium">Criada</th>
                    <th className="px-4 py-3 font-medium">Último uso</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 w-28" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{r.name}</td>
                      <td className="px-4 py-3"><code className="text-xs">{r.key_prefix}…</code></td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                      <td className="px-4 py-3 text-muted-foreground">{r.last_used_at ? new Date(r.last_used_at).toLocaleString("pt-BR") : "—"}</td>
                      <td className="px-4 py-3">{r.revoked_at ? <Badge variant="destructive">Revogada</Badge> : <Badge>Ativa</Badge>}</td>
                      <td className="px-4 py-3 text-right space-x-1">
                        {!r.revoked_at && (
                          <Button size="icon" variant="ghost" aria-label="Revogar" onClick={() => revoke(r.id)}><Ban className="h-4 w-4" /></Button>
                        )}
                        <Button size="icon" variant="ghost" aria-label="Excluir" onClick={() => remove(r.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Chave API</DialogTitle>
            <DialogDescription>Nome descritivo para identificar onde a chave será usada.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="k-name">Nome</Label>
            <Input id="k-name" value={name} placeholder="Ex.: Integração n8n" onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={saving}>{saving && <Loader2 className="h-4 w-4 animate-spin" />} Gerar Chave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={newKey !== null} onOpenChange={(v) => !v && setNewKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Copie sua chave agora</DialogTitle>
            <DialogDescription>Esta é a única vez que a chave completa será exibida. Guarde em local seguro.</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/50 p-3 font-mono text-xs break-all">{newKey}</div>
          <DialogFooter>
            <Button variant="outline" onClick={() => newKey && copy(newKey)}><Copy className="h-4 w-4" /> Copiar</Button>
            <Button onClick={() => setNewKey(null)}>Já guardei</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
