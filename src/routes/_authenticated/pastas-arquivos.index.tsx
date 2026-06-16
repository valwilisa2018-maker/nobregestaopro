import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FolderOpen, Search, Link as LinkIcon, Copy, FileText, Plus, RefreshCw, Trash2, CheckSquare, Square, Loader2, LayoutGrid, List as ListIcon } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pastas-arquivos/")({
  component: PastasArquivosPage,
});

function PastasArquivosPage() {
  const [search, setSearch] = useState("");
  const [sellerId, setSellerId] = useState<string>("_all");
  const [producerId, setProducerId] = useState<string>("_all");
  const [columnId, setColumnId] = useState<string>("_all");
  const [onlyWithoutLink, setOnlyWithoutLink] = useState<boolean>(true);
  const [open, setOpen] = useState(false);
  const [nName, setNName] = useState("");
  const [nClient, setNClient] = useState("");
  const [nService, setNService] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "list">(() =>
    (typeof window !== "undefined" && (localStorage.getItem("pastas_index_view") as any)) || "grid",
  );
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function openFolder(id: string) {
    setOpeningId(id);
    try {
      const data = await qc.fetchQuery({
        queryKey: ["project_folder", id],
        queryFn: async () => {
          const { data, error } = await supabase
            .from("project_folders" as any)
            .select("*")
            .eq("id", id)
            .single();
          if (error) throw error;
          return data as any;
        },
      });
      if (!data) throw new Error("Pasta não encontrada");
      await navigate({ to: "/pastas-arquivos/$folderId", params: { folderId: id } });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir a pasta");
    } finally {
      setOpeningId(null);
    }
  }

  const folders = useQuery({
    queryKey: ["project_folders_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select(
          "id, sale_id, kanban_card_id, client_name, service_type, folder_name, google_drive_link, platform_link, created_at, " +
            "service_orders:kanban_card_id(column_id, producer_id, producers(name)), " +
            "sales:sale_id(seller_id, sellers(name), producer_id, producers(name))",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const counts = useQuery({
    queryKey: ["project_folder_counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folder_files" as any)
        .select("folder_id");
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) {
        const k = (r as any).folder_id;
        m.set(k, (m.get(k) ?? 0) + 1);
      }
      return m;
    },
  });

  const sellers = useQuery({
    queryKey: ["sellers_all"],
    queryFn: async () => (await supabase.from("sellers").select("id,name").order("name")).data ?? [],
  });
  const producers = useQuery({
    queryKey: ["producers_all"],
    queryFn: async () => (await supabase.from("producers").select("id,name").order("name")).data ?? [],
  });
  const cols = useQuery({
    queryKey: ["kanban_cols_all"],
    queryFn: async () =>
      (await supabase.from("kanban_columns").select("id,name").order("sort_order")).data ?? [],
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (folders.data ?? []).filter((f: any) => {
      if (term && !(`${f.client_name ?? ""} ${f.folder_name ?? ""}`.toLowerCase().includes(term))) return false;
      if (sellerId !== "_all" && f.sales?.seller_id !== sellerId) return false;
      if (producerId !== "_all") {
        const pid = f.service_orders?.producer_id ?? f.sales?.producer_id;
        if (pid !== producerId) return false;
      }
      if (columnId !== "_all" && f.service_orders?.column_id !== columnId) return false;
      if (onlyWithoutLink && f.google_drive_link) return false;
      return true;
    });
  }, [folders.data, search, sellerId, producerId, columnId, onlyWithoutLink]);

  async function saveDrive(folderId: string, current: string | null) {
    const link = window.prompt("Link do Google Drive:", current ?? "");
    if (link === null) return;
    const { error } = await supabase
      .from("project_folders" as any)
      .update({ google_drive_link: link })
      .eq("id", folderId);
    if (error) toast.error(error.message);
    else {
      toast.success("Link salvo");
      folders.refetch();
    }
  }

  async function copyInternal(f: any) {
    const url = f.platform_link ?? `${window.location.origin}/pastas-arquivos/${f.id}`;
    try { await navigator.clipboard.writeText(url); } catch {}
    if (!f.platform_link) {
      await supabase.from("project_folders" as any).update({ platform_link: url }).eq("id", f.id);
      folders.refetch();
    }
    toast.success("Link da Plataforma copiado");
  }

  async function createFolder() {
    if (!nName.trim()) { toast.error("Informe um nome"); return; }
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: inserted, error } = await (supabase.from("project_folders" as any).insert({
      folder_name: nName.trim(),
      client_name: nClient.trim() || null,
      service_type: nService.trim() || null,
      created_by: u.user?.id,
    }).select("id").single() as any);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    // Link da plataforma já fica salvo na pasta no momento da criação.
    const newId = (inserted as any)?.id as string | undefined;
    if (newId) {
      const url = `${window.location.origin}/pastas-arquivos/${newId}`;
      await supabase.from("project_folders" as any).update({ platform_link: url }).eq("id", newId);
    }
    toast.success("Pasta criada");
    setNName(""); setNClient(""); setNService(""); setOpen(false);
    folders.refetch();
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }

  async function deleteFolders(ids: string[]) {
    if (ids.length === 0) return;
    if (!confirm(`Excluir ${ids.length} pasta(s)? Esta ação não pode ser desfeita.`)) return;
    const { error } = await supabase.from("project_folders" as any).delete().in("id", ids);
    if (error) { toast.error(error.message); return; }
    toast.success(`${ids.length} pasta(s) excluída(s)`);
    setSelected(new Set());
    folders.refetch();
    counts.refetch();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="w-6 h-6 text-primary" /> Pastas e Arquivos
        </h1>
        <div className="flex items-center gap-2">
        {selected.size > 0 && (
          <Button variant="destructive" onClick={() => deleteFolders(Array.from(selected))}>
            <Trash2 className="w-4 h-4 mr-1" /> Excluir ({selected.size})
          </Button>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            await Promise.all([folders.refetch(), counts.refetch()]);
            toast.success("Lista sincronizada");
          }}
          disabled={folders.isFetching}
        >
          <RefreshCw className={`w-4 h-4 mr-1 ${folders.isFetching ? "animate-spin" : ""}`} />
          Sincronizar
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="w-4 h-4 mr-1" /> Nova pasta</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Criar nova pasta</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nome da pasta *</Label>
                <Input value={nName} onChange={(e) => setNName(e.target.value)} placeholder="Ex: Cliente X - Vídeo institucional" />
              </div>
              <div className="space-y-1">
                <Label>Cliente (opcional)</Label>
                <Input value={nClient} onChange={(e) => setNClient(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Tipo de serviço (opcional)</Label>
                <Input value={nService} onChange={(e) => setNService(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button onClick={createFolder} disabled={saving}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por cliente..."
            className="pl-8 w-64"
          />
        </div>
        <Select value={sellerId} onValueChange={setSellerId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Vendedor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos vendedores</SelectItem>
            {(sellers.data ?? []).map((s: any) => (<SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={producerId} onValueChange={setProducerId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Produtor" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos produtores</SelectItem>
            {(producers.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <Select value={columnId} onValueChange={setColumnId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Coluna Kanban" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas colunas</SelectItem>
            {(cols.data ?? []).map((c: any) => (<SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>))}
          </SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-xs text-muted-foreground ml-2">
          <Switch checked={onlyWithoutLink} onCheckedChange={setOnlyWithoutLink} />
          Apenas sem link do Drive
        </label>
        {filtered.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => {
              const allIds = filtered.map((f: any) => f.id);
              const allSelected = allIds.every((id) => selected.has(id));
              setSelected(allSelected ? new Set() : new Set(allIds));
            }}
          >
            {filtered.every((f: any) => selected.has(f.id)) ? (
              <><CheckSquare className="w-4 h-4 mr-1" /> Desmarcar todas</>
            ) : (
              <><Square className="w-4 h-4 mr-1" /> Selecionar todas</>
            )}
          </Button>
        )}
        <ToggleGroup
          type="single"
          value={viewMode}
          onValueChange={(v) => {
            if (!v) return;
            setViewMode(v as any);
            if (typeof window !== "undefined") localStorage.setItem("pastas_index_view", v);
          }}
          size="sm"
          className={filtered.length > 0 ? "" : "ml-auto"}
        >
          <ToggleGroupItem value="grid" aria-label="Grade"><LayoutGrid className="w-4 h-4" /></ToggleGroupItem>
          <ToggleGroupItem value="list" aria-label="Lista"><ListIcon className="w-4 h-4" /></ToggleGroupItem>
        </ToggleGroup>
      </div>

      {folders.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">Nenhuma pasta encontrada.</div>
      ) : viewMode === "grid" ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((f: any) => {
            const count = counts.data?.get(f.id) ?? 0;
            return (
              <Card key={f.id} className={`hover:border-primary/60 transition ${selected.has(f.id) ? "ring-2 ring-primary" : ""}`}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <Checkbox
                      checked={selected.has(f.id)}
                      onCheckedChange={() => toggleSelect(f.id)}
                      className="mt-1"
                    />
                    <FolderOpen className="w-8 h-8 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{f.folder_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{f.client_name} • {f.service_type}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {count} arquivos</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[10px] font-medium">
                      Vendedor: {f.sales?.sellers?.name ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-[10px] font-medium">
                      Produtor: {f.service_orders?.producers?.name ?? "—"}
                    </span>
                  </div>
                  {f.google_drive_link && (
                    <a href={f.google_drive_link} target="_blank" rel="noreferrer"
                       className="text-xs text-primary truncate flex items-center gap-1 hover:underline">
                      <LinkIcon className="w-3 h-3" /> Google Drive
                    </a>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="h-7 text-xs"
                      disabled={openingId === f.id}
                      onClick={() => openFolder(f.id)}
                    >
                      {openingId === f.id ? (
                        <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Abrindo...</>
                      ) : (
                        "Abrir"
                      )}
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyInternal(f)}>
                      <Copy className="w-3 h-3 mr-1" /> Copiar link
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive ml-auto"
                      onClick={() => deleteFolders([f.id])}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {filtered.map((f: any) => {
              const count = counts.data?.get(f.id) ?? 0;
              return (
                <div key={f.id} className={`flex items-center gap-3 px-3 py-2 hover:bg-muted/40 ${selected.has(f.id) ? "bg-primary/5" : ""}`}>
                  <Checkbox
                    checked={selected.has(f.id)}
                    onCheckedChange={() => toggleSelect(f.id)}
                  />
                  <FolderOpen className="w-5 h-5 text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{f.folder_name}</div>
                    <div className="text-xs text-muted-foreground truncate">{f.client_name} • {f.service_type}</div>
                  </div>
                  <div className="hidden md:flex flex-wrap gap-1 max-w-[320px]">
                    <span className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 text-[10px] font-medium">
                      Vendedor: {f.sales?.sellers?.name ?? "—"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-purple-500/10 text-purple-600 dark:text-purple-400 px-2 py-0.5 text-[10px] font-medium">
                      Produtor: {f.service_orders?.producers?.name ?? "—"}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 w-20 justify-end">
                    <FileText className="w-3 h-3" /> {count}
                  </span>
                  <Button
                    size="sm"
                    variant="default"
                    className="h-7 text-xs"
                    disabled={openingId === f.id}
                    onClick={() => openFolder(f.id)}
                  >
                    {openingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : "Abrir"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copyInternal(f)} title="Copiar link">
                    <Copy className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => deleteFolders([f.id])} title="Excluir">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}