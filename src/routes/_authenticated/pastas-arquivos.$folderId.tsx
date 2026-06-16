import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, FileImage, FileVideo, FileAudio, FileText, File as FileIcon, Trash2, Link as LinkIcon, Download, Copy, ChevronDown, ChevronRight, Folder as FolderIcon } from "lucide-react";
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

/** Inline preview tile (Google Drive-style). */
function PreviewTile({
  item,
  onOpen,
  onDelete,
}: {
  item: any;
  onOpen: (path: string) => void;
  onDelete: (id: string, path: string) => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSignedUrl(item.file_url).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [item.file_url]);

  const mime = (item.file_type ?? "").toLowerCase();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/") || /\.(webm|mp3|wav|m4a|ogg|oga)$/i.test(item.file_url ?? "");
  const isPdf = mime === "application/pdf";
  const Icon = iconFor(item.file_type);

  return (
    <div className="group relative rounded-md border bg-card overflow-hidden hover:shadow-md transition">
      <div className="aspect-video bg-muted/40 flex items-center justify-center overflow-hidden">
        {!url && <div className="text-[10px] text-muted-foreground">carregando…</div>}
        {url && isImage && (
          <button onClick={() => onOpen(item.file_url)} className="w-full h-full">
            <img src={url} alt={item.file_name} className="w-full h-full object-cover" />
          </button>
        )}
        {url && isVideo && (
          <video src={url} className="w-full h-full object-cover" controls preload="metadata" />
        )}
        {url && isAudio && !isVideo && (
          <div className="p-2 w-full"><audio src={url} controls preload="metadata" className="w-full" /></div>
        )}
        {url && isPdf && (
          <iframe src={url} className="w-full h-full" title={item.file_name} />
        )}
        {url && !isImage && !isVideo && !isAudio && !isPdf && (
          <Icon className="w-10 h-10 text-muted-foreground" />
        )}
      </div>
      <div className="p-2 flex items-center gap-2">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <button onClick={() => onOpen(item.file_url)} className="text-xs truncate flex-1 text-left hover:underline">
          {item.file_name}
        </button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => onOpen(item.file_url)} title="Abrir">
          <Download className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive"
          onClick={() => onDelete(item.id, item.file_url)} title="Excluir">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function FolderDetail() {
  const { folderId } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CATEGORIES.map((c) => [c.id, true])),
  );
  const [dragOver, setDragOver] = useState<string | null>(null);
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

  /** Upload arbitrary files routing each to its best-fit category automatically. */
  async function uploadFilesAuto(list: File[] | FileList, forceCategory?: CategoryId) {
    if (!folder.data || !list) return;
    const arr = Array.from(list as any) as File[];
    if (!arr.length) return;
    setBusy(forceCategory ?? "__drop");
    const { data: ud } = await supabase.auth.getUser();
    try {
      for (const file of arr) {
        const cat: CategoryId = forceCategory ?? detectCategory(file);
        await uploadToFolder({
          folderId,
          saleId: folder.data.sale_id,
          cardId: folder.data.kanban_card_id,
          file,
          category: cat,
          userId: ud.user?.id ?? null,
        });
      }
      toast.success(`${arr.length} arquivo(s) enviado(s)`);
      qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setBusy(null);
      setDragOver(null);
    }
  }

  // Cole (Ctrl/Cmd+V) arquivos copiados em qualquer lugar da página da pasta.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.files;
      if (items && items.length) {
        e.preventDefault();
        uploadFilesAuto(items);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder.data?.id]);

  function dropHandlers(category?: CategoryId) {
    const key = category ?? "__page";
    return {
      onDragOver: (e: React.DragEvent) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(key);
        }
      },
      onDragLeave: () => setDragOver((cur) => (cur === key ? null : cur)),
      onDrop: (e: React.DragEvent) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        uploadFilesAuto(e.dataTransfer.files, category);
      },
    };
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
    <div className="p-6 space-y-4 relative" {...dropHandlers()}>
      {dragOver === "__page" && (
        <div className="fixed inset-0 z-50 bg-primary/10 border-4 border-dashed border-primary pointer-events-none flex items-center justify-center">
          <div className="bg-background/95 px-6 py-3 rounded-lg font-semibold text-primary shadow-lg">
            Solte os arquivos aqui
          </div>
        </div>
      )}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link to="/pastas-arquivos"><ArrowLeft className="w-4 h-4 mr-1" /> Voltar</Link>
        </Button>
        <div className="ml-auto text-[11px] text-muted-foreground">
          💡 Arraste arquivos aqui ou cole com <kbd className="px-1 border rounded">Ctrl/Cmd+V</kbd>
        </div>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
            <FolderIcon className="w-6 h-6 text-primary" />
          </div>
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

      <div className="space-y-3">
        {CATEGORIES.map((cat) => {
          const items = grouped[cat.id] ?? [];
          const isOpen = open[cat.id] ?? true;
          const isDragging = dragOver === cat.id;
          return (
            <Card
              key={cat.id}
              className={isDragging ? "ring-2 ring-primary bg-primary/5 transition" : "transition"}
              {...dropHandlers(cat.id)}
            >
              <CardContent className="p-3 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <button
                    onClick={() => setOpen((s) => ({ ...s, [cat.id]: !isOpen }))}
                    className="flex items-center gap-2 font-semibold text-sm"
                  >
                    {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                    {cat.label}
                    <span className="text-xs text-muted-foreground font-normal">({items.length})</span>
                  </button>
                  <Button size="sm" variant="outline" disabled={busy === cat.id}
                    onClick={() => fileInputs.current[cat.id]?.click()}>
                    <Upload className="w-4 h-4 mr-1" /> {busy === cat.id ? "Enviando..." : "Upload"}
                  </Button>
                  <input
                    ref={(el) => { fileInputs.current[cat.id] = el; }}
                    type="file" multiple className="hidden"
                    onChange={(e) => handleUpload(cat.id, e.target.files)}
                  />
                </div>
                {isOpen && (
                  items.length ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
                      {items.map((it) => (
                        <PreviewTile key={it.id} item={it} onOpen={openFile} onDelete={deleteFile} />
                      ))}
                    </div>
                  ) : (
                    <div className={`text-xs italic px-2 py-4 rounded border-2 border-dashed text-center ${isDragging ? "border-primary text-primary" : "border-muted text-muted-foreground"}`}>
                      {isDragging ? "Solte aqui para enviar" : "Nenhum arquivo. Arraste, cole ou clique em Upload."}
                    </div>
                  )
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// re-export so detectCategory keeps a usage during refactors
export { detectCategory };