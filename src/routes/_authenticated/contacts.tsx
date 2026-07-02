import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Contact2, Loader2, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listContacts, upsertContact, deleteContact } from "@/lib/contacts.functions";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nada por aqui.</div>,
});

function ContactsPage() {
  const list = useServerFn(listContacts);
  const upsert = useServerFn(upsertContact);
  const del = useServerFn(deleteContact);
  const qc = useQueryClient();

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const pageSize = 15;

  const query = useQuery({
    queryKey: ["contacts", q, status, page],
    queryFn: () => list({ data: { q, status, page, pageSize } }),
  });

  const rows = query.data?.rows ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<{ id: string | null; name: string; phone: string; status: "active" | "blocked" | "archived"; notes: string }>({
    id: null, name: "", phone: "", status: "active", notes: "",
  });

  const saveM = useMutation({
    mutationFn: async () => upsert({ data: {
      id: editing.id, name: editing.name || null, phone: editing.phone,
      status: editing.status, notes: editing.notes || null,
    } }),
    onSuccess: () => { toast.success("Contato salvo"); setOpen(false); qc.invalidateQueries({ queryKey: ["contacts"] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const delM = useMutation({
    mutationFn: async (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["contacts"] }); },
  });

  const openNew = () => { setEditing({ id: null, name: "", phone: "", status: "active", notes: "" }); setOpen(true); };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="h-10 w-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center"><Contact2 className="h-5 w-5" /></div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Contatos</h1>
            <p className="text-xs text-muted-foreground">{total} contato(s) salvos</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou telefone" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="pl-8 w-[260px]" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
              <SelectItem value="archived">Arquivados</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={openNew}><UserPlus className="h-4 w-4" /> Novo contato</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <Skeleton className="h-9 w-9 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-4 w-20 ml-auto" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="text-center py-16 space-y-3">
              <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center"><Contact2 className="h-6 w-6 text-muted-foreground" /></div>
              <p className="text-sm text-muted-foreground">Nenhum contato encontrado. Novos números que entrarem no WhatsApp aparecem aqui automaticamente.</p>
              <Button variant="outline" onClick={openNew}><Plus className="h-4 w-4" /> Adicionar manualmente</Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-3">Nome</th>
                    <th className="text-left px-4 py-3">Telefone</th>
                    <th className="text-left px-4 py-3">Status</th>
                    <th className="text-left px-4 py-3">Cadastro</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id as string} className="border-t hover:bg-accent/30 transition-colors">
                      <td className="px-4 py-3 font-medium">{(r.name as string) || <span className="text-muted-foreground italic">sem nome</span>}</td>
                      <td className="px-4 py-3 tabular-nums">{r.phone as string}</td>
                      <td className="px-4 py-3">
                        <Badge variant={r.status === "active" ? "default" : "secondary"} className="capitalize">{r.status as string}</Badge>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{new Date(r.created_at as string).toLocaleDateString("pt-BR")}</td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="ghost" onClick={() => { setEditing({ id: r.id as string, name: (r.name as string) ?? "", phone: r.phone as string, status: (r.status as never) ?? "active", notes: "" }); setOpen(true); }}>Editar</Button>
                        <Button size="sm" variant="ghost" onClick={() => delM.mutate(r.id as string)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Próxima</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing.id ? "Editar contato" : "Novo contato"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Nome</Label><Input value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))} /></div>
            <div><Label>Telefone</Label><Input value={editing.phone} placeholder="5511999998888" onChange={(e) => setEditing((s) => ({ ...s, phone: e.target.value }))} /></div>
            <div>
              <Label>Status</Label>
              <Select value={editing.status} onValueChange={(v) => setEditing((s) => ({ ...s, status: v as never }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Ativo</SelectItem>
                  <SelectItem value="blocked">Bloqueado</SelectItem>
                  <SelectItem value="archived">Arquivado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label><Textarea rows={3} value={editing.notes} onChange={(e) => setEditing((s) => ({ ...s, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => saveM.mutate()} disabled={!editing.phone || saveM.isPending}>
              {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}