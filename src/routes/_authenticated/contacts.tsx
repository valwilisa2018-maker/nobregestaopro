import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Contact2, Download, FileSpreadsheet, FileText, Filter, Loader2, Plus, Search, Trash2, Upload, UserPlus,
  CheckCircle2, Pencil, Users, Shield, Archive, Phone, Clock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { listContacts, upsertContact, deleteContact, bulkImportContacts, listAllContactsForExport } from "@/lib/contacts.functions";
import { downloadTemplateCSV, downloadTemplateXLSX, exportContactsCSV, exportContactsPDF, exportContactsXLSX, parseContactsFile } from "@/lib/contacts-bulk";

export const Route = createFileRoute("/_authenticated/contacts")({
  component: ContactsPage,
  errorComponent: ({ error }) => <div className="p-6 text-sm text-destructive">{error.message}</div>,
  notFoundComponent: () => <div className="p-6 text-sm">Nada por aqui.</div>,
});

function ContactsPage() {
  const list = useServerFn(listContacts);
  const upsert = useServerFn(upsertContact);
  const del = useServerFn(deleteContact);
  const bulk = useServerFn(bulkImportContacts);
  const exportAll = useServerFn(listAllContactsForExport);
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

  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState<null | "xlsx" | "csv" | "pdf">(null);

  const onImportFile = async (f: File) => {
    setImporting(true);
    try {
      const rows = await parseContactsFile(f);
      if (rows.length === 0) { toast.error("Nenhum contato válido no arquivo"); return; }
      const res = await bulk({ data: { rows: rows.map((r) => ({ name: r.name, phone: r.phone, status: (r.status as never) ?? "active", notes: r.notes ?? null })) } });
      toast.success(`${res.inserted} contato(s) importado(s)`);
      qc.invalidateQueries({ queryKey: ["contacts"] });
    } catch (e) { toast.error((e as Error).message); }
    finally { setImporting(false); if (fileRef.current) fileRef.current.value = ""; }
  };

  const doExport = async (kind: "xlsx" | "csv" | "pdf") => {
    setExporting(kind);
    try {
      const { rows } = await exportAll();
      const mapped = rows.map((r: Record<string, unknown>) => ({ name: (r.name as string) ?? null, phone: r.phone as string, status: (r.status as string) ?? "active", notes: (r.notes as string) ?? null }));
      if (kind === "xlsx") exportContactsXLSX(mapped);
      else if (kind === "csv") exportContactsCSV(mapped);
      else exportContactsPDF(mapped);
    } catch (e) { toast.error((e as Error).message); }
    finally { setExporting(null); }
  };

  const metrics = useMemo(() => {
    const all = query.data?.rows ?? [];
    const active = all.filter((r) => r.status === "active").length;
    const blocked = all.filter((r) => r.status === "blocked").length;
    const archived = all.filter((r) => r.status === "archived").length;
    return { total: all.length, active, blocked, archived };
  }, [query.data?.rows]);

  const statusBadge = (status: string) => {
    switch (status) {
      case "active": return { variant: "default" as const, className: "bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0 shadow-none", label: "Ativo" };
      case "blocked": return { variant: "secondary" as const, className: "bg-destructive/15 text-destructive border-destructive/20 hover:bg-destructive/20", label: "Bloqueado" };
      case "archived": return { variant: "secondary" as const, className: "bg-amber-500/15 text-amber-500 border-amber-500/20 hover:bg-amber-500/20", label: "Arquivado" };
      default: return { variant: "secondary" as const, className: "", label: status };
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Premium Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/90 via-blue-950/40 to-slate-950/90 p-6 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 -bottom-24 h-72 w-72 rounded-full bg-indigo-500/15 blur-3xl" />
        <div className="relative flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.7)] ring-1 ring-white/20">
                <Contact2 className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
                  Contatos
                </h1>
                <p className="text-sm text-muted-foreground">{total} contato(s) salvos · gerencie seus leads e clientes.</p>
              </div>
            </div>
            <Button onClick={openNew} className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:opacity-90">
              <UserPlus className="mr-2 h-4 w-4" /> Novo contato
            </Button>
          </div>

          {/* KPIs */}
          <div className="relative grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              { label: "Total", value: metrics.total, icon: <Users className="h-4 w-4" />, tone: "from-blue-500/25 to-cyan-500/10", ring: "ring-blue-500/30", text: "text-blue-300" },
              { label: "Ativos", value: metrics.active, icon: <CheckCircle2 className="h-4 w-4" />, tone: "from-emerald-500/25 to-teal-500/10", ring: "ring-emerald-500/30", text: "text-emerald-300" },
              { label: "Bloqueados", value: metrics.blocked, icon: <Shield className="h-4 w-4" />, tone: "from-red-500/25 to-rose-500/10", ring: "ring-red-500/30", text: "text-red-300" },
              { label: "Arquivados", value: metrics.archived, icon: <Archive className="h-4 w-4" />, tone: "from-amber-500/25 to-orange-500/10", ring: "ring-amber-500/30", text: "text-amber-300" },
            ].map((k) => (
              <div key={k.label} className={`rounded-2xl border border-white/10 bg-gradient-to-br ${k.tone} p-4 ring-1 ${k.ring} backdrop-blur`}>
                <div className={`flex items-center gap-2 text-xs uppercase tracking-wider ${k.text}`}>{k.icon}<span>{k.label}</span></div>
                <div className="mt-1 text-2xl font-bold tabular-nums">{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <Card className="overflow-hidden border border-white/10 bg-slate-900/60 p-4 backdrop-blur">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Buscar por nome ou telefone" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              className="h-11 pl-10 bg-slate-950/50 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20" />
          </div>
          <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
            <SelectTrigger className="h-11 w-[160px] bg-slate-950/50 border-white/10 focus:ring-blue-500/20">
              <Filter className="h-4 w-4 mr-2 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Ativos</SelectItem>
              <SelectItem value="blocked">Bloqueados</SelectItem>
              <SelectItem value="archived">Arquivados</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); }} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={importing} className="h-11 border-white/10 bg-slate-950/50 hover:bg-slate-800/60 hover:text-foreground">
                  {importing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Upload className="h-4 w-4 mr-2" />} Importar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 border-white/10 bg-slate-900/95 backdrop-blur">
                <DropdownMenuLabel>Importar contatos</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => fileRef.current?.click()}>
                  <FileSpreadsheet className="h-4 w-4 mr-2" /> Enviar planilha (.xlsx / .csv)
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">Baixar modelo</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => downloadTemplateXLSX()}>
                  <Download className="h-4 w-4 mr-2" /> Modelo Excel (.xlsx)
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadTemplateCSV()}>
                  <Download className="h-4 w-4 mr-2" /> Modelo CSV (.csv)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={exporting !== null} className="h-11 border-white/10 bg-slate-950/50 hover:bg-slate-800/60 hover:text-foreground">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Download className="h-4 w-4 mr-2" />} Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-white/10 bg-slate-900/95 backdrop-blur">
                <DropdownMenuItem onClick={() => doExport("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-2" /> Excel (.xlsx)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("csv")}><FileSpreadsheet className="h-4 w-4 mr-2" /> CSV (.csv)</DropdownMenuItem>
                <DropdownMenuItem onClick={() => doExport("pdf")}><FileText className="h-4 w-4 mr-2" /> PDF (.pdf)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button onClick={openNew} className="h-11 bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:opacity-90">
              <UserPlus className="mr-2 h-4 w-4" /> Novo contato
            </Button>
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden border border-white/10 bg-slate-900/60 backdrop-blur p-0">
        {query.isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-4 w-20 ml-auto" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="relative overflow-hidden py-16 text-center space-y-4">
            <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />
            <div className="relative mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center shadow-lg">
              <Contact2 className="h-7 w-7 text-muted-foreground" />
            </div>
            <p className="relative text-sm text-muted-foreground max-w-md mx-auto">Nenhum contato encontrado. Novos números que entrarem no WhatsApp aparecem aqui automaticamente.</p>
            <Button variant="outline" onClick={openNew} className="relative border-white/10 bg-slate-950/50 hover:bg-slate-800/60"><Plus className="h-4 w-4 mr-1" /> Adicionar manualmente</Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="text-left px-4 py-3 font-semibold">Nome</th>
                  <th className="text-left px-4 py-3 font-semibold">Telefone</th>
                  <th className="text-left px-4 py-3 font-semibold">Status</th>
                  <th className="text-left px-4 py-3 font-semibold">Cadastro</th>
                  <th className="px-4 py-3 text-right font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const badge = statusBadge(r.status as string);
                  return (
                    <tr key={r.id as string} className="border-t border-white/5 hover:bg-white/[0.03] transition-colors">
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 border border-white/10 flex items-center justify-center text-xs font-bold text-muted-foreground">
                            {((r.name as string) || "?").charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium">{(r.name as string) || <span className="text-muted-foreground italic">sem nome</span>}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-muted-foreground">{r.phone as string}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={badge.variant} className={`${badge.className} text-[11px] font-medium`}>{badge.label}</Badge>
                      </td>
                      <td className="px-4 py-3.5 text-muted-foreground">
                        <span className="flex items-center gap-1.5"><Clock className="h-3 w-3" /> {new Date(r.created_at as string).toLocaleDateString("pt-BR")}</span>
                      </td>
                      <td className="px-4 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-blue-500/10 hover:text-blue-400"
                            onClick={() => { setEditing({ id: r.id as string, name: (r.name as string) ?? "", phone: r.phone as string, status: (r.status as never) ?? "active", notes: "" }); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                            onClick={() => delM.mutate(r.id as string)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="border-white/10 bg-slate-950/50 hover:bg-slate-800/60">Anterior</Button>
          <span className="text-muted-foreground">Página {page} de {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="border-white/10 bg-slate-950/50 hover:bg-slate-800/60">Próxima</Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md border border-white/10 bg-slate-950/95 p-0 shadow-[0_25px_70px_-25px_rgba(0,0,0,0.7)] backdrop-blur-2xl">
          <div className="relative overflow-hidden">
            <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-blue-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -left-20 -bottom-20 h-56 w-56 rounded-full bg-indigo-500/15 blur-3xl" />
            <DialogHeader className="relative border-b border-white/10 p-6">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] ring-1 ring-white/20">
                  {editing.id ? <Pencil className="h-5 w-5 text-white" /> : <UserPlus className="h-5 w-5 text-white" />}
                </div>
                <div>
                  <DialogTitle className="bg-gradient-to-r from-blue-300 via-indigo-200 to-violet-300 bg-clip-text text-2xl font-bold text-transparent">
                    {editing.id ? "Editar contato" : "Novo contato"}
                  </DialogTitle>
                  <DialogDescription className="sr-only">
                    {editing.id ? "Edite os dados do contato" : "Adicione um novo contato à sua lista"}
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
            <div className="relative space-y-4 p-6">
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Nome</Label>
                <Input value={editing.name} onChange={(e) => setEditing((s) => ({ ...s, name: e.target.value }))}
                  className="h-11 bg-slate-900/60 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20" />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Telefone</Label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input value={editing.phone} placeholder="5511999998888" onChange={(e) => setEditing((s) => ({ ...s, phone: e.target.value }))}
                    className="h-11 pl-10 bg-slate-900/60 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Status</Label>
                <Select value={editing.status} onValueChange={(v) => setEditing((s) => ({ ...s, status: v as never }))}>
                  <SelectTrigger className="h-11 bg-slate-900/60 border-white/10 focus:ring-blue-500/20"><SelectValue /></SelectTrigger>
                  <SelectContent className="border-white/10 bg-slate-900/95 backdrop-blur">
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="blocked">Bloqueado</SelectItem>
                    <SelectItem value="archived">Arquivado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Notas</Label>
                <Textarea rows={3} value={editing.notes} onChange={(e) => setEditing((s) => ({ ...s, notes: e.target.value }))}
                  className="bg-slate-900/60 border-white/10 focus:border-blue-500/50 focus:ring-2 focus:ring-blue-500/20 resize-none" />
              </div>
            </div>
            <DialogFooter className="relative border-t border-white/10 p-6 gap-2">
              <Button variant="ghost" onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground hover:bg-white/5">Cancelar</Button>
              <Button onClick={() => saveM.mutate()} disabled={!editing.phone || saveM.isPending}
                className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-[0_10px_30px_-10px_rgba(59,130,246,0.6)] hover:opacity-90">
                {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Salvar contato
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
