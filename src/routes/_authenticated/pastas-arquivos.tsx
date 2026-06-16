import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FolderOpen, Search, Link as LinkIcon, Copy, FileText, Plus } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/pastas-arquivos")({
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

  const folders = useQuery({
    queryKey: ["project_folders_list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select(
          "id, sale_id, kanban_card_id, client_name, service_type, folder_name, google_drive_link, platform_link, created_at, " +
            "service_orders:kanban_card_id(column_id, producer_id, producers(name)), " +
            "sales:sale_id(seller_id, sellers(name))",
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
      if (producerId !== "_all" && f.service_orders?.producer_id !== producerId) return false;
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
    const { error } = await supabase.from("project_folders" as any).insert({
      folder_name: nName.trim(),
      client_name: nClient.trim() || null,
      service_type: nService.trim() || null,
      created_by: u.user?.id,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Pasta criada");
    setNName(""); setNClient(""); setNService(""); setOpen(false);
    folders.refetch();
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FolderOpen className="w-6 h-6 text-primary" /> Pastas e Arquivos
        </h1>
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
      </div>

      {folders.isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-muted-foreground py-12 text-center">Nenhuma pasta encontrada.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((f: any) => {
            const count = counts.data?.get(f.id) ?? 0;
            return (
              <Card key={f.id} className="hover:border-primary/60 transition">
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start gap-2">
                    <FolderOpen className="w-8 h-8 text-primary shrink-0" />
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{f.folder_name}</div>
                      <div className="text-xs text-muted-foreground truncate">{f.client_name} • {f.service_type}</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><FileText className="w-3 h-3" /> {count} arquivos</span>
                    <span>{f.sales?.sellers?.name ?? "—"}</span>
                  </div>
                  {f.google_drive_link && (
                    <a href={f.google_drive_link} target="_blank" rel="noreferrer"
                       className="text-xs text-primary truncate flex items-center gap-1 hover:underline">
                      <LinkIcon className="w-3 h-3" /> Google Drive
                    </a>
                  )}
                  <div className="flex flex-wrap gap-1 pt-1">
                    <Button asChild size="sm" variant="default" className="h-7 text-xs">
                      <Link to="/pastas-arquivos/$folderId" params={{ folderId: f.id }}>Abrir</Link>
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => copyInternal(f)}>
                      <Copy className="w-3 h-3 mr-1" /> Copiar link
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => saveDrive(f.id, f.google_drive_link)}>
                      <LinkIcon className="w-3 h-3 mr-1" /> Drive
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}