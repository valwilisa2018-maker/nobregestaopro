import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Upload, FileImage, FileVideo, FileAudio, FileText, File as FileIcon, Trash2, Link as LinkIcon, Download, Copy } from "lucide-react";
import { toast } from "sonner";
import { CATEGORIES, type CategoryId, detectCategory, uploadToFolder, getSignedUrl } from "@/lib/project-folders";

export const Route = createFileRoute("/_authenticated/pastas-arquivos/$folderId")({
  component: FolderDetail,
});

function iconFor(mime?: string | null) {
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return FileImage;
  if (t.startsWith("video/")) return FileVideo;
  if (t.startsWith("audio/")) return FileAudio;
  if (t === "application/pdf") return FileText;
  return FileIcon;
}

function FolderDetail() {
  const { folderId } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const folder = useQuery({
    queryKey: ["project_folder", folderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("*")
        .eq("id", folderId)
        .single();
      if (error) throw error;
      return data as any;
    },
  });

  const files = useQuery({
    queryKey: ["project_folder_files", folderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folder_files" as any)
        .select("*")
        .eq("folder_id", folderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function handleUpload(category: CategoryId, list: FileList | null) {
    if (!list || !folder.data) return;
    setBusy(category);
    const { data: ud } = await supabase.auth.getUser();
    try {
      for (const file of Array.from(list)) {
        await uploadToFolder({
          folderId,
          saleId: folder.data.sale_id,
          cardId: folder.data.kanban_card_id,
          file,
          category,
          userId: ud.user?.id ?? null,
        });
      }
      toast.success("Upload concluído");
      qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setBusy(null);
    }
  }

  async function openFile(path: string) {
    try {
      const url = await getSignedUrl(path);
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao abrir");
    }
  }

  async function deleteFile(id: string, path: string) {
    if (!confirm("Excluir este arquivo?")) return;
    await supabase.storage.from("project-files").remove([path]);
    const { error } = await supabase.from("project_folder_files" as any).delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Excluído");
      qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
    }
  }

  async function saveDrive() {
    if (!folder.data) return;
    const link = window.prompt("Link do Google Drive:", folder.data.google_drive_link ?? "");
    if (link === null) return;
    const { error } = await supabase
      .from("project_folders" as any)
      .update({ google_drive_link: link })
      .eq("id", folderId);
    if (error) toast.error(error.message);
    else {
      toast.success("Salvo");
      qc.invalidateQueries({ queryKey: ["project_folder", folderId] });
    }
  }

  if (folder.isLoading) return <div className="p-6">Carregando...</div>;
  if (!folder.data) return <div className="p-6">Pasta não encontrada.</div>;

  const f = folder.data;
  const platformLink =
    f.platform_link ?? (typeof window !== "undefined" ? `${window.location.origin}/pastas-arquivos/${f.id}` : `/pastas-arquivos/${f.id}`);
  const grouped: Record<string, any[]> = {};
  for (const cat of CATEGORIES) grouped[cat.id] = [];
  for (const file of files.data ?? []) {
    (grouped[file.file_category] ||= []).push(file);
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/pastas-arquivos"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold">{f.folder_name}</h1>
          <p className="text-sm text-muted-foreground">{f.client_name} • {f.service_type}</p>
          {f.google_drive_link && (
            <a href={f.google_drive_link} target="_blank" rel="noreferrer"
               className="text-xs text-primary flex items-center gap-1 hover:underline mt-1">
              <LinkIcon className="w-3 h-3" /> {f.google_drive_link}
            </a>
          )}
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button size="sm" variant="outline" onClick={saveDrive}>
            <LinkIcon className="w-4 h-4 mr-1" /> {f.google_drive_link ? "Editar link Drive" : "Adicionar link Drive"}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              navigator.clipboard.writeText(platformLink);
              toast.success("Link da Plataforma copiado");
            }}
          >
            <Copy className="w-4 h-4 mr-1" /> Copiar link da Plataforma
          </Button>
        </div>
      </div>
      <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs flex items-center gap-2">
        <LinkIcon className="w-3 h-3 text-red-600" />
        <span className="text-muted-foreground">Link da Plataforma:</span>
        <code className="flex-1 truncate">{platformLink}</code>
        <Button
          size="sm"
          variant="ghost"
          className="h-7"
          onClick={() => {
            navigator.clipboard.writeText(platformLink);
            toast.success("Copiado");
          }}
        >
          <Copy className="w-3 h-3" />
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {CATEGORIES.map((cat) => (
          <Card key={cat.id} className="border-2">
            <CardContent className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-semibold">{cat.label}</div>
                <Button size="sm" variant="ghost" disabled={busy === cat.id}
                  onClick={() => fileInputs.current[cat.id]?.click()}>
                  <Upload className="w-4 h-4 mr-1" /> {busy === cat.id ? "Enviando..." : "Upload"}
                </Button>
                <input
                  ref={(el) => { fileInputs.current[cat.id] = el; }}
                  type="file" multiple className="hidden"
                  onChange={(e) => handleUpload(cat.id, e.target.files)}
                />
              </div>
              <div className="space-y-1 min-h-[40px]">
                {grouped[cat.id]?.length ? grouped[cat.id].map((it) => {
                  const Icon = iconFor(it.file_type);
                  return (
                    <div key={it.id} className="flex items-center justify-between gap-2 px-2 py-1 rounded hover:bg-muted/50 text-xs">
                      <button onClick={() => openFile(it.file_url)} className="flex items-center gap-2 min-w-0 flex-1 text-left">
                        <Icon className="w-4 h-4 text-primary shrink-0" />
                        <span className="truncate">{it.file_name}</span>
                      </button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => openFile(it.file_url)}>
                        <Download className="w-3 h-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
                        onClick={() => deleteFile(it.id, it.file_url)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  );
                }) : (
                  <div className="text-xs text-muted-foreground italic px-2 py-1">vazio</div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// re-export so detectCategory keeps a usage during refactors
export { detectCategory };