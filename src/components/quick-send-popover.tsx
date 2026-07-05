import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Zap, Plus, Trash2, Pencil, Loader2, Image as ImageIcon, Video as VideoIcon,
  Music, FileText, X, Send, AlertCircle, Mic,
} from "lucide-react";
import { toast } from "sonner";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  listQuickSends, upsertQuickSend, deleteQuickSend, sendQuickSend,
} from "@/lib/evolution.functions";

type QuickSend = {
  id: string;
  title: string;
  text: string | null;
  media_type: string | null;
  media_mime: string | null;
  media_name: string | null;
  media_size: number | null;
  media_url: string | null;
  storage_path: string | null;
  is_ptt: boolean;
};

const MAX_VIDEO_MB = 15;

function fmtSize(bytes: number | null | undefined) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function KindIcon({ type, className }: { type: string | null; className?: string }) {
  const cls = className ?? "h-4 w-4";
  if (type === "image") return <ImageIcon className={`${cls} text-violet-600`} />;
  if (type === "video") return <VideoIcon className={`${cls} text-rose-600`} />;
  if (type === "audio") return <Music className={`${cls} text-orange-600`} />;
  if (type === "file") return <FileText className={`${cls} text-sky-600`} />;
  return null;
}

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Falha ao ler arquivo"));
    r.onload = () => {
      const s = String(r.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    r.readAsDataURL(file);
  });
}

export function QuickSendPopover({
  contactId,
  disabled,
  onSending,
}: {
  contactId: string | null;
  disabled?: boolean;
  onSending?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<QuickSend[]>([]);
  const [loading, setLoading] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<QuickSend | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const listFn = useServerFn(listQuickSends);
  const upsertFn = useServerFn(upsertQuickSend);
  const deleteFn = useServerFn(deleteQuickSend);
  const sendFn = useServerFn(sendQuickSend);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listFn();
      setItems((r as { items: QuickSend[] }).items ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao carregar envios rápidos");
    } finally {
      setLoading(false);
    }
  }, [listFn]);

  useEffect(() => {
    if (open && items.length === 0 && !loading) load();
  }, [open, items.length, loading, load]);

  async function handleSend(qs: QuickSend) {
    if (!contactId) { toast.error("Selecione um contato"); return; }
    setSendingId(qs.id);
    onSending?.();
    setOpen(false);
    try {
      await sendFn({ data: { id: qs.id, contactId } });
      toast.success(`"${qs.title}" enviado`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao enviar");
    } finally {
      setSendingId(null);
    }
  }

  async function handleDelete(qs: QuickSend) {
    if (!confirm(`Excluir "${qs.title}"?`)) return;
    try {
      await deleteFn({ data: { id: qs.id } });
      setItems((prev) => prev.filter((x) => x.id !== qs.id));
      toast.success("Excluído");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            disabled={disabled}
            className="p-2 text-gray-500 hover:text-amber-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-full transition disabled:opacity-50"
            aria-label="Envios rápidos"
            title="Envios rápidos"
          >
            {sendingId ? <Loader2 className="h-6 w-6 animate-spin" /> : <Zap className="h-6 w-6" />}
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top" align="start"
          className="w-[min(360px,calc(100vw-24px))] p-0 max-h-[70vh] overflow-hidden flex flex-col"
        >
          <div className="px-3 py-2 border-b flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <Zap className="h-4 w-4 text-amber-500 shrink-0" />
              <div className="text-sm font-semibold truncate">Envios rápidos</div>
            </div>
            <Button
              size="sm" variant="ghost"
              className="h-7 gap-1 text-amber-600 hover:text-amber-700"
              onClick={() => { setEditing(null); setEditorOpen(true); setOpen(false); }}
            >
              <Plus className="h-4 w-4" /> Novo
            </Button>
          </div>
          <div className="overflow-y-auto flex-1">
            {loading && (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin inline mr-1" /> Carregando…
              </div>
            )}
            {!loading && items.length === 0 && (
              <div className="p-8 text-center">
                <div className="mx-auto h-12 w-12 grid place-items-center rounded-full bg-amber-100 text-amber-600 mb-3">
                  <Zap className="h-6 w-6" />
                </div>
                <div className="text-sm font-medium text-foreground">Nenhum envio rápido</div>
                <div className="text-xs text-muted-foreground mt-1 px-4">
                  Crie mensagens prontas com texto e mídia para disparar em um clique.
                </div>
                <Button
                  size="sm" className="mt-4"
                  onClick={() => { setEditing(null); setEditorOpen(true); setOpen(false); }}
                >
                  <Plus className="h-4 w-4 mr-1" /> Criar primeiro
                </Button>
              </div>
            )}
            {!loading && items.map((qs) => (
              <div
                key={qs.id}
                className="group px-3 py-2 border-b last:border-b-0 hover:bg-accent transition flex items-start gap-2"
              >
                <button
                  onClick={() => handleSend(qs)}
                  disabled={!contactId || !!sendingId}
                  className="flex-1 min-w-0 text-left disabled:opacity-50"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {qs.media_type && <KindIcon type={qs.media_type} className="h-3.5 w-3.5 shrink-0" />}
                    {qs.is_ptt && <Mic className="h-3.5 w-3.5 text-emerald-600 shrink-0" />}
                    <div className="text-sm font-medium truncate">{qs.title}</div>
                  </div>
                  {qs.text && (
                    <div className="text-xs text-muted-foreground truncate mt-0.5">{qs.text}</div>
                  )}
                </button>
                <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition shrink-0">
                  <button
                    onClick={() => { setEditing(qs); setEditorOpen(true); setOpen(false); }}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Editar"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(qs)}
                    className="p-1.5 rounded hover:bg-red-100 text-muted-foreground hover:text-red-600"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <button
                  onClick={() => handleSend(qs)}
                  disabled={!contactId || !!sendingId}
                  className="p-1.5 rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 shrink-0"
                  aria-label="Enviar"
                  title="Enviar agora"
                >
                  {sendingId === qs.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <QuickSendEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        initial={editing}
        onSaved={(item) => {
          setItems((prev) => {
            const exists = prev.find((x) => x.id === item.id);
            return exists ? prev.map((x) => x.id === item.id ? item : x) : [item, ...prev];
          });
        }}
        upsertFn={upsertFn}
      />
    </>
  );
}

function QuickSendEditor({
  open, onOpenChange, initial, onSaved, upsertFn,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initial: QuickSend | null;
  onSaved: (item: QuickSend) => void;
  upsertFn: ReturnType<typeof useServerFn<typeof upsertQuickSend>>;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [existingMedia, setExistingMedia] = useState<{ name: string; type: string; size: number | null; isPtt: boolean } | null>(null);
  const [removeExisting, setRemoveExisting] = useState(false);
  const [isPtt, setIsPtt] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setTitle(initial?.title ?? "");
    setText(initial?.text ?? "");
    setFile(null);
    setRemoveExisting(false);
    setIsPtt(!!initial?.is_ptt);
    setError(null);
    setExistingMedia(initial?.media_type ? {
      name: initial.media_name ?? "arquivo",
      type: initial.media_type,
      size: initial.media_size,
      isPtt: initial.is_ptt,
    } : null);
  }, [open, initial]);

  function handleFile(f: File | null, kind?: "audio") {
    setError(null);
    if (!f) { setFile(null); return; }
    if (f.type.startsWith("video/") && f.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`Vídeo excede o limite de ${MAX_VIDEO_MB}MB (${fmtSize(f.size)})`);
      setFile(null);
      return;
    }
    setFile(f);
    setRemoveExisting(false);
    if (kind === "audio" || f.type.startsWith("audio/")) setIsPtt(true);
  }

  const currentKind = file
    ? (file.type.startsWith("image/") ? "image"
      : file.type.startsWith("video/") ? "video"
      : file.type.startsWith("audio/") ? "audio" : "file")
    : (existingMedia && !removeExisting ? existingMedia.type : null);

  const showPttToggle = currentKind === "audio";

  async function handleSave() {
    const trimmed = title.trim();
    if (!trimmed) { setError("Informe um título"); return; }
    if (!text.trim() && !file && (!existingMedia || removeExisting)) {
      setError("Adicione texto ou mídia");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const media = file ? {
        base64: await fileToBase64(file),
        mime: file.type || "application/octet-stream",
        fileName: file.name,
      } : undefined;
      const res = await upsertFn({
        data: {
          id: initial?.id,
          title: trimmed,
          text: text.trim() || undefined,
          isPtt: showPttToggle ? isPtt : false,
          media,
          removeMedia: !file && removeExisting,
        },
      });
      onSaved((res as { item: QuickSend }).item);
      onOpenChange(false);
      toast.success(initial ? "Envio rápido atualizado" : "Envio rápido criado");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao salvar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-amber-500" />
            {initial ? "Editar envio rápido" : "Novo envio rápido"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Título do atalho</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Boas-vindas, Endereço, Cardápio"
              maxLength={80}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Texto</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Mensagem que será enviada..."
              rows={4}
              maxLength={4000}
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Mídia (opcional)</label>
            {file ? (
              <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/50">
                <KindIcon type={currentKind} className="h-5 w-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{file.name}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtSize(file.size)}</div>
                </div>
                <button onClick={() => setFile(null)} className="p-1 rounded hover:bg-muted text-muted-foreground">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : existingMedia && !removeExisting ? (
              <div className="flex items-center gap-2 rounded-md border p-2 bg-muted/50">
                <KindIcon type={existingMedia.type} className="h-5 w-5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{existingMedia.name}</div>
                  <div className="text-[11px] text-muted-foreground">{fmtSize(existingMedia.size)} · salvo</div>
                </div>
                <button onClick={() => setRemoveExisting(true)} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="Remover mídia">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: "Imagem", accept: "image/*", icon: ImageIcon, color: "text-violet-600" },
                  { label: "Vídeo", accept: "video/*", icon: VideoIcon, color: "text-rose-600" },
                  { label: "Áudio", accept: "audio/*", icon: Music, color: "text-orange-600" },
                  { label: "Arquivo", accept: "*/*", icon: FileText, color: "text-sky-600" },
                ].map((o) => (
                  <button
                    key={o.label}
                    onClick={() => {
                      if (!fileRef.current) return;
                      fileRef.current.accept = o.accept;
                      fileRef.current.click();
                    }}
                    className="flex flex-col items-center gap-1 py-2.5 rounded-md border hover:bg-accent hover:border-amber-400 transition"
                    type="button"
                  >
                    <o.icon className={`h-5 w-5 ${o.color}`} />
                    <span className="text-[11px]">{o.label}</span>
                  </button>
                ))}
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                />
              </div>
            )}
            <div className="text-[11px] text-muted-foreground">
              Vídeo: máximo {MAX_VIDEO_MB}MB. Áudio é enviado como mensagem de voz (PTT).
            </div>
          </div>

          {showPttToggle && (
            <label className="flex items-center gap-2 text-xs cursor-pointer select-none">
              <input
                type="checkbox"
                checked={isPtt}
                onChange={(e) => setIsPtt(e.target.checked)}
                className="accent-emerald-500"
              />
              <Mic className="h-3.5 w-3.5 text-emerald-600" />
              Enviar como mensagem de voz (PTT)
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 rounded-md bg-red-50 border border-red-200 p-2 text-xs text-red-700">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving} className="bg-amber-500 hover:bg-amber-600 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Zap className="h-4 w-4 mr-1" />}
            {initial ? "Salvar" : "Criar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}