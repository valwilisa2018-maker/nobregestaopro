import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Upload, FileImage, FileVideo, FileAudio, FileText, File as FileIcon, Trash2, Link as LinkIcon, Download, Copy, Folder as FolderIcon, LayoutGrid, List as ListIcon, Save, X, FolderPlus, Pencil } from "lucide-react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { type CategoryId, detectCategory, uploadToFolder, getSignedUrl } from "@/lib/project-folders";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import JSZip from "jszip";

export const Route = createFileRoute("/_authenticated/pastas-arquivos/$folderId")({
  component: FolderDetail,
});

function iconFor(mime?: string | null) {
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return FileImage;
  if (t.startsWith("video/")) return FileVideo;
  if (t.startsWith("audio/")) return FileAudio;
  if (t === "application/pdf") return FileText;
  if (t.startsWith("text/")) return FileText;
  return FileIcon;
}

function isTextFile(item: any) {
  const t = (item?.file_type ?? "").toLowerCase();
  const n = (item?.file_name ?? "").toLowerCase();
  return (
    t.startsWith("text/") ||
    t.includes("officedocument.wordprocessingml") ||
    t === "application/msword" ||
    /\.(txt|md|html?|rtf|docx?|odt)$/i.test(n)
  );
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
  const [textPreview, setTextPreview] = useState<string | null>(null);
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
  const isText = mime.startsWith("text/") || /\.(txt|md|csv|log|json|html?)$/i.test(item.file_name ?? "");
  const Icon = iconFor(item.file_type);

  useEffect(() => {
    if (!url || !isText) return;
    let alive = true;
    fetch(url)
      .then((r) => r.text())
      .then((t) => { if (alive) setTextPreview(t.slice(0, 2000)); })
      .catch(() => {});
    return () => { alive = false; };
  }, [url, isText]);

  return (
    <div className="group relative rounded-lg border bg-card overflow-hidden hover:shadow-md hover:border-primary/40 transition">
      {/* Header — ícone + nome + ações (estilo Google Drive) */}
      <div className="flex items-center gap-2 px-3 py-2 border-b">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <button
          onClick={() => onOpen(item.file_url)}
          className="text-xs font-medium truncate flex-1 text-left hover:underline"
          title={item.file_name}
        >
          {item.file_name}
        </button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100" onClick={() => onOpen(item.file_url)} title="Abrir">
          <Download className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-destructive opacity-0 group-hover:opacity-100"
          onClick={() => onDelete(item.id, item.file_url)} title="Excluir">
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
      {/* Thumbnail grande */}
      <button
        onClick={() => onOpen(item.file_url)}
        className="block w-full aspect-[4/3] bg-muted/40 flex items-center justify-center overflow-hidden"
      >
        {!url && <div className="text-[10px] text-muted-foreground">carregando…</div>}
        {url && isImage && (
          <img src={url} alt={item.file_name} className="w-full h-full object-cover" />
        )}
        {url && isVideo && (
          <video
            src={`${url}#t=0.5`}
            className="w-full h-full object-cover"
            preload="metadata"
            muted
            playsInline
            onMouseEnter={(e) => { (e.currentTarget as HTMLVideoElement).play().catch(() => {}); }}
            onMouseLeave={(e) => { const v = e.currentTarget as HTMLVideoElement; v.pause(); v.currentTime = 0.5; }}
          />
        )}
        {url && isAudio && !isVideo && (
          <div className="p-2 w-full" onClick={(e) => e.stopPropagation()}>
            <audio src={url} controls preload="metadata" className="w-full" />
          </div>
        )}
        {url && isPdf && (
          <iframe src={url} className="w-full h-full pointer-events-none" title={item.file_name} />
        )}
        {url && isText && (
          <pre className="w-full h-full overflow-hidden text-[9px] leading-tight p-2 text-left whitespace-pre-wrap bg-background text-foreground">
            {textPreview ?? "carregando…"}
          </pre>
        )}
        {url && !isImage && !isVideo && !isAudio && !isPdf && !isText && (
          <Icon className="w-12 h-12 text-muted-foreground" />
        )}
      </button>
      {/* Rodapé com metadados */}
      <div className="px-3 py-1.5 text-[10px] text-muted-foreground truncate border-t bg-muted/20">
        {new Date(item.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
        {item.file_size ? ` • ${Math.round(item.file_size / 1024)} KB` : ""}
      </div>
    </div>
  );
}

function FolderDetail() {
  const { folderId } = Route.useParams();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [view, setView] = useState<"grid" | "list">(() =>
    (typeof window !== "undefined" && (localStorage.getItem("pastas_view") as any)) || "grid",
  );
  useEffect(() => {
    if (typeof window !== "undefined") localStorage.setItem("pastas_view", view);
  }, [view]);
  const [editing, setEditing] = useState<any | null>(null);
  type UploadItem = { id: string; name: string; size: number; status: "uploading" | "done" | "error"; error?: string };
  const [uploads, setUploads] = useState<UploadItem[]>([]);

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

  const subfolders = useQuery({
    queryKey: ["project_folder_children", folderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("id, folder_name, created_at")
        .eq("parent_id", folderId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  async function createSubfolder() {
    if (!folder.data) return;
    const name = window.prompt("Nome da nova pasta:");
    if (!name || !name.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data: inserted, error } = await (supabase.from("project_folders" as any).insert({
      folder_name: name.trim(),
      client_name: folder.data.client_name,
      service_type: folder.data.service_type,
      sale_id: folder.data.sale_id,
      kanban_card_id: folder.data.kanban_card_id,
      parent_id: folderId,
      created_by: u.user?.id,
    }).select("id").single() as any);
    if (error) { toast.error(error.message); return; }
    const newId = (inserted as any)?.id;
    if (newId) {
      const url = `${window.location.origin}/pastas-arquivos/${newId}`;
      await supabase.from("project_folders" as any).update({ platform_link: url }).eq("id", newId);
    }
    toast.success("Pasta criada");
    qc.invalidateQueries({ queryKey: ["project_folder_children", folderId] });
  }

  async function deleteSubfolder(id: string) {
    if (!confirm("Excluir esta subpasta e todo seu conteúdo?")) return;
    const { error } = await supabase.from("project_folders" as any).delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pasta excluída");
    qc.invalidateQueries({ queryKey: ["project_folder_children", folderId] });
  }

  async function renameFolder(id: string, currentName: string, queryKey: any[]) {
    const name = window.prompt("Novo nome da pasta:", currentName ?? "");
    if (name === null) return;
    const trimmed = name.trim();
    if (!trimmed || trimmed === currentName) return;
    const { error } = await supabase
      .from("project_folders" as any)
      .update({ folder_name: trimmed })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Pasta renomeada");
    qc.invalidateQueries({ queryKey });
  }

  /** Upload arbitrary files routing each to its best-fit category automatically. */
  async function uploadFilesAuto(list: File[] | FileList, forceCategory?: CategoryId) {
    if (!folder.data || !list) return;
    const arr = Array.from(list as any) as File[];
    if (!arr.length) return;
    setBusy(forceCategory ?? "__drop");
    const { data: ud } = await supabase.auth.getUser();
    const queued: UploadItem[] = arr.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}-${f.name}`,
      name: f.name,
      size: f.size,
      status: "uploading",
    }));
    setUploads((prev) => [...queued, ...prev]);
    try {
      for (let i = 0; i < arr.length; i++) {
        const file = arr[i];
        const qid = queued[i].id;
        const cat: CategoryId = forceCategory ?? detectCategory(file);
        try {
          await uploadToFolder({
            folderId,
            saleId: folder.data.sale_id,
            cardId: folder.data.kanban_card_id,
            file,
            category: cat,
            userId: ud.user?.id ?? null,
          });
          setUploads((prev) => prev.map((u) => (u.id === qid ? { ...u, status: "done" } : u)));
        } catch (err: any) {
          setUploads((prev) => prev.map((u) => (u.id === qid ? { ...u, status: "error", error: err?.message } : u)));
          throw err;
        }
      }
      toast.success(`${arr.length} arquivo(s) enviado(s)`);
      qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
      // Auto-clear completed items after a short delay
      setTimeout(() => {
        setUploads((prev) => prev.filter((u) => u.status === "uploading"));
      }, 2500);
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

  async function downloadAllZip() {
    const list = files.data ?? [];
    if (!list.length || !folder.data) return;
    setBusy("__zip");
    try {
      const zip = new JSZip();
      const used = new Map<string, number>();
      for (const it of list) {
        const url = await getSignedUrl(it.file_url);
        const res = await fetch(url);
        let name = it.file_name || it.file_url.split("/").pop() || "arquivo";
        const type = (it.file_type ?? "").toLowerCase();
        const isRoteiro = type === "text/html" || /\.html?$/i.test(name);
        let blob: Blob;
        if (isRoteiro) {
          const htmlText = await res.text();
          const tmp = document.createElement("div");
          tmp.innerHTML = htmlText;
          const text = tmp.innerText || tmp.textContent || "";
          blob = new Blob([text], { type: "text/plain;charset=utf-8" });
          name = name.replace(/\.[^.]+$/, "") + ".txt";
        } else {
          blob = await res.blob();
        }
        if (used.has(name)) {
          const n = (used.get(name) ?? 1) + 1;
          used.set(name, n);
          const dot = name.lastIndexOf(".");
          name = dot > 0 ? `${name.slice(0, dot)} (${n})${name.slice(dot)}` : `${name} (${n})`;
        } else {
          used.set(name, 1);
        }
        zip.file(name, blob);
      }
      const content = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(content);
      a.download = `${folder.data.folder_name || "pasta"}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(a.href);
      toast.success("ZIP gerado");
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao gerar ZIP");
    } finally {
      setBusy(null);
    }
  }

  if (folder.isLoading) return <div className="p-6">Carregando...</div>;
  if (!folder.data) return <div className="p-6">Pasta não encontrada.</div>;

  const f = folder.data;
  const platformLink =
    f.platform_link ?? (typeof window !== "undefined" ? `${window.location.origin}/pastas-arquivos/${f.id}` : `/pastas-arquivos/${f.id}`);
  const items: any[] = files.data ?? [];

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
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{f.folder_name}</h1>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0"
              title="Renomear pasta"
              onClick={() => renameFolder(f.id, f.folder_name, ["project_folder", folderId])}
            >
              <Pencil className="w-4 h-4" />
            </Button>
          </div>
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

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">
          {items.length} {items.length === 1 ? "arquivo" : "arquivos"}
        </div>
        <div className="flex items-center gap-2">
          <ToggleGroup type="single" value={view} onValueChange={(v) => v && setView(v as any)} size="sm">
            <ToggleGroupItem value="grid" aria-label="Grade"><LayoutGrid className="w-4 h-4" /></ToggleGroupItem>
            <ToggleGroupItem value="list" aria-label="Lista"><ListIcon className="w-4 h-4" /></ToggleGroupItem>
          </ToggleGroup>
          <Button size="sm" variant="outline" onClick={createSubfolder}>
            <FolderPlus className="w-4 h-4 mr-1" /> Nova pasta
          </Button>
          <Button size="sm" variant="outline" disabled={busy === "__upload"}
            onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-4 h-4 mr-1" /> {busy === "__upload" ? "Enviando..." : "Upload"}
          </Button>
          <Button size="sm" variant="outline" disabled={busy === "__zip" || items.length === 0}
            onClick={downloadAllZip} title="Baixar todos os arquivos em ZIP">
            <Download className="w-4 h-4 mr-1" /> {busy === "__zip" ? "Compactando..." : "Baixar tudo (ZIP)"}
          </Button>
          <input
            ref={fileInputRef}
            type="file" multiple className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) {
                setBusy("__upload");
                uploadFilesAuto(e.target.files).finally(() => {
                  if (fileInputRef.current) fileInputRef.current.value = "";
                });
              }
            }}
          />
        </div>
      </div>

      {(subfolders.data?.length ?? 0) > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {subfolders.data!.map((s: any) => (
            <div key={s.id} className="group relative rounded-lg border bg-card hover:shadow-md hover:border-primary/40 transition flex items-center gap-2 px-3 py-3">
              <FolderIcon className="w-5 h-5 text-primary shrink-0" />
              <Link
                to="/pastas-arquivos/$folderId"
                params={{ folderId: s.id }}
                className="flex-1 text-sm font-medium truncate hover:underline"
                title={s.folder_name}
              >
                {s.folder_name}
              </Link>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100"
                onClick={() => renameFolder(s.id, s.folder_name, ["project_folder_children", folderId])}
                title="Renomear"
              >
                <Pencil className="w-3 h-3" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-destructive opacity-0 group-hover:opacity-100"
                onClick={() => deleteSubfolder(s.id)}
                title="Excluir"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {items.length === 0 && (subfolders.data?.length ?? 0) === 0 ? (
        <div className="text-xs italic px-2 py-12 rounded border-2 border-dashed text-center border-muted text-muted-foreground">
          Nenhum arquivo nesta pasta. Arraste, cole ou clique em Upload.
        </div>
      ) : items.length === 0 ? null : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
          {items.map((it) => (
            <PreviewTile
              key={it.id}
              item={it}
              onOpen={(p) => (isTextFile(it) ? setEditing(it) : openFile(p))}
              onDelete={deleteFile}
            />
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0 divide-y">
            {items.map((it) => {
              const Icon = iconFor(it.file_type);
              return (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2 hover:bg-muted/40">
                  <Icon className="w-4 h-4 text-primary shrink-0" />
                  <button
                    onClick={() => (isTextFile(it) ? setEditing(it) : openFile(it.file_url))}
                    className="flex-1 text-left text-sm truncate hover:underline"
                  >
                    {it.file_name}
                  </button>
                  <span className="text-xs text-muted-foreground hidden sm:inline">
                    {new Date(it.created_at).toLocaleDateString()}
                  </span>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0"
                    onClick={() => openFile(it.file_url)} title="Baixar/Abrir">
                    <Download className="w-3 h-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive"
                    onClick={() => deleteFile(it.id, it.file_url)} title="Excluir">
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {editing && (
        <RoteiroEditor
          item={editing}
          folder={f}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
          }}
        />
      )}
    </div>
  );
}

function RoteiroEditor({
  item, folder, onClose, onSaved,
}: { item: any; folder: any; onClose: () => void; onSaved: () => void }) {
  const [html, setHtml] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const url = await getSignedUrl(item.file_url);
        const name = (item.file_name ?? "").toLowerCase();
        const isDocx = /\.docx$/i.test(name) || (item.file_type ?? "").includes("officedocument.wordprocessingml");
        if (isDocx) {
          const buf = await fetch(url).then((r) => r.arrayBuffer());
          // @ts-expect-error - no types for browser bundle
          const mammoth = await import("mammoth/mammoth.browser.js");
          const res = await (mammoth as any).convertToHtml({ arrayBuffer: buf });
          if (!alive) return;
          setHtml(res.value || "<p>(documento vazio)</p>");
        } else {
          const text = await fetch(url).then((r) => r.text());
          if (!alive) return;
          const looksHtml = /<[a-z][^>]*>/i.test(text);
          setHtml(looksHtml ? text : text.replace(/\n/g, "<br/>"));
        }
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao carregar");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [item.file_url]);

  function exec(cmd: string, val?: string) {
    ref.current?.focus();
    document.execCommand(cmd, false, val);
  }

  async function copyText() {
    const text = ref.current?.innerText ?? "";
    try { await navigator.clipboard.writeText(text); toast.success("Texto copiado"); }
    catch { toast.error("Falha ao copiar"); }
  }

  function downloadAs(kind: "txt" | "html") {
    const baseName = (item.file_name ?? "roteiro").replace(/\.[^.]+$/, "");
    if (kind === "txt") {
      const text = ref.current?.innerText ?? "";
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    } else {
      const content = ref.current?.innerHTML ?? html;
      const doc = `<!doctype html><html><head><meta charset="utf-8"><title>${baseName}</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;line-height:1.6;color:#111}</style></head><body>${content}</body></html>`;
      const blob = new Blob([doc], { type: "text/html;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${baseName}.html`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const content = ref.current?.innerHTML ?? html;
      const blob = new Blob([content], { type: "text/html" });
      const { error: upErr } = await supabase.storage
        .from("project-files")
        .update(item.file_url, blob, { contentType: "text/html", upsert: true });
      if (upErr) throw upErr;
      await supabase.from("project_folder_files" as any)
        .update({ file_type: "text/html", file_size: blob.size })
        .eq("id", item.id);
      toast.success("Roteiro salvo");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }

  const colors = ["#000000", "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#a855f7", "#ec4899", "#6b7280"];

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-none w-screen h-screen sm:rounded-none p-4 flex flex-col gap-3 overflow-hidden">
        <DialogHeader>
          <DialogTitle className="truncate">{item.file_name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-1 border rounded-md p-1 bg-muted/30">
          <Button size="sm" variant="ghost" className="h-7" onClick={() => exec("bold")}><b>B</b></Button>
          <Button size="sm" variant="ghost" className="h-7 italic" onClick={() => exec("italic")}>I</Button>
          <Button size="sm" variant="ghost" className="h-7 underline" onClick={() => exec("underline")}>U</Button>
          <div className="w-px h-5 bg-border mx-1" />
          <span className="text-xs text-muted-foreground mr-1">Cor:</span>
          {colors.map((c) => (
            <button
              key={c}
              type="button"
              className="w-5 h-5 rounded border"
              style={{ backgroundColor: c }}
              onClick={() => exec("foreColor", c)}
              title={c}
            />
          ))}
          <div className="ml-auto flex gap-1">
            <Button size="sm" variant="outline" className="h-7" onClick={copyText}>
              <Copy className="w-3 h-3 mr-1" /> Copiar
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => downloadAs("txt")}>
              <Download className="w-3 h-3 mr-1" /> .txt
            </Button>
            <Button size="sm" variant="outline" className="h-7" onClick={() => downloadAs("html")}>
              <Download className="w-3 h-3 mr-1" /> .html
            </Button>
            <Button size="sm" className="h-7" onClick={save} disabled={saving || loading}>
              <Save className="w-3 h-3 mr-1" /> {saving ? "Salvando..." : "Salvar"}
            </Button>
          </div>
        </div>
        {loading ? (
          <div className="py-12 text-center text-muted-foreground text-sm">Carregando...</div>
        ) : (
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            className="flex-1 min-h-0 overflow-auto border rounded-md p-4 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

// re-export so detectCategory keeps a usage during refactors
export { detectCategory };