import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessagesSquare, Send, Paperclip, Mic, Square, Search, FileText, Copy, FolderPlus, FolderOpen } from "lucide-react";
import { toast } from "sonner";
import { detectCategory, uploadToFolder, getSignedUrl, type CategoryId } from "@/lib/project-folders";
import { transcribeAudio } from "@/lib/ai-transcribe.functions";

export const Route = createFileRoute("/_authenticated/chat-organizador")({
  component: ChatOrganizador,
});

/** Detect "criar pasta NOME" / "nova pasta NOME" / "abrir pasta NOME" voice commands. */
function parseCreateFolderCommand(input: string): string | null {
  const t = input.trim();
  if (!t) return null;
  const patterns = [
    /^(?:cria(?:r)?|nova|abrir|gera(?:r)?)\s+(?:uma\s+)?pasta\s+(?:do|de|para|pra|chamada|com\s+o\s+nome\s+de|nome)?\s*(.+)$/i,
    /^pasta\s+nova\s+(?:do|de|para|pra)?\s*(.+)$/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
    if (m && m[1]) {
      return m[1]
        .replace(/[.!?]+$/g, "")
        .replace(/^\s+|\s+$/g, "")
        .slice(0, 120);
    }
  }
  return null;
}

function ChatOrganizador() {
  const qc = useQueryClient();
  const transcribe = useServerFn(transcribeAudio);
  const [search, setSearch] = useState("");
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [lastCreated, setLastCreated] = useState<{ id: string; name: string } | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => { taRef.current?.focus(); }, [activeFolderId]);

  const folders = useQuery({
    queryKey: ["chat_folders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folders" as any)
        .select("id, folder_name, client_name, service_type, sale_id, kanban_card_id, platform_link, google_drive_link, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  // Cutoff: only show folders created from "now" forward (per user request).
  // Stored once in localStorage so the list stays clean across reloads.
  const cutoffISO = useMemo(() => {
    const KEY = "chat_organizador_cutoff_iso";
    const existing = typeof window !== "undefined" ? localStorage.getItem(KEY) : null;
    if (existing) return existing;
    const nowIso = new Date().toISOString();
    if (typeof window !== "undefined") localStorage.setItem(KEY, nowIso);
    return nowIso;
  }, []);

  const filteredFolders = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = (folders.data ?? []).filter(
      (f: any) => !f.created_at || f.created_at >= cutoffISO,
    );
    if (!term) return base;
    return base.filter((f: any) =>
      `${f.client_name ?? ""} ${f.folder_name ?? ""}`.toLowerCase().includes(term),
    );
  }, [folders.data, search, cutoffISO]);

  const active = useMemo(
    () => (folders.data ?? []).find((f: any) => f.id === activeFolderId) ?? null,
    [folders.data, activeFolderId],
  );

  // Realtime sync: any change to project_folders refreshes the folders list
  useEffect(() => {
    const ch = supabase
      .channel("realtime:project_folders:chat")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "project_folders" },
        () => {
          qc.invalidateQueries({ queryKey: ["chat_folders"] });
          qc.invalidateQueries({ queryKey: ["card_folder"] });
          qc.invalidateQueries({ queryKey: ["project_folders_list"] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  // Auto-select the first folder once they load
  useEffect(() => {
    if (activeFolderId || !folders.data?.length) return;
    setActiveFolderId(folders.data[0].id);
  }, [folders.data, activeFolderId]);

  const msgs = useQuery({
    queryKey: ["chat_messages", activeFolderId],
    enabled: !!activeFolderId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_folder_messages" as any)
        .select("*")
        .eq("folder_id", activeFolderId)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [msgs.data]);

  /** Creates a project folder and returns its platform link. */
  async function createFolderFromCommand(name: string) {
    const { data: ud } = await supabase.auth.getUser();
    const platformLink =
      typeof window !== "undefined" ? `${window.location.origin}/pastas-arquivos/` : "/pastas-arquivos/";
    const { data, error } = await supabase
      .from("project_folders" as any)
      .insert({
        folder_name: name,
        client_name: name,
        created_by: ud.user?.id ?? null,
      })
      .select("id, folder_name")
      .single();
    if (error) throw error;
    const folder = data as any;
    const fullLink = `${platformLink}${folder.id}`;
    await supabase
      .from("project_folders" as any)
      .update({ platform_link: fullLink })
      .eq("id", folder.id);
    setLastCreated({ id: folder.id, name: folder.folder_name });
    qc.invalidateQueries({ queryKey: ["chat_folders"] });
    qc.invalidateQueries({ queryKey: ["project_folders_list"] });
    try {
      await navigator.clipboard.writeText(fullLink);
      toast.success(`Pasta "${folder.folder_name}" criada — link copiado!`);
    } catch {
      toast.success(`Pasta "${folder.folder_name}" criada com sucesso`);
    }
    return { id: folder.id as string, name: folder.folder_name as string, link: fullLink };
  }

  async function uploadFilesToFolder(folderId: string, files: File[]) {
    const { data: ud } = await supabase.auth.getUser();
    for (const file of files) {
      const cat: CategoryId = detectCategory(file);
      await uploadToFolder({
        folderId,
        saleId: null,
        cardId: null,
        file,
        category: cat,
        userId: ud.user?.id ?? null,
      });
    }
    qc.invalidateQueries({ queryKey: ["project_folder_files", folderId] });
  }

  function resetChat() {
    setPendingFiles([]);
    setText("");
    setActiveFolderId(null);
    if (fileRef.current) fileRef.current.value = "";
    setTimeout(() => taRef.current?.focus(), 0);
  }

  async function sendText() {
    if (!text.trim()) return;
    const cmdName = parseCreateFolderCommand(text);
    if (cmdName) {
      setSending(true);
      try {
        const created = await createFolderFromCommand(cmdName);
        if (pendingFiles.length) {
          await uploadFilesToFolder(created.id, pendingFiles);
          toast.success(`${pendingFiles.length} arquivo(s) enviados para a pasta`);
        }
        resetChat();
      } catch (e: any) {
        toast.error(e?.message ?? "Erro ao criar pasta");
      } finally {
        setSending(false);
      }
      return;
    }
    if (!active) {
      toast.error('Selecione uma pasta — ou diga "criar pasta NOME".');
      return;
    }
    setSending(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      await supabase.from("project_folder_messages" as any).insert({
        folder_id: active.id,
        sale_id: active.sale_id,
        kanban_card_id: active.kanban_card_id,
        message: text,
        sender_id: ud.user?.id,
      });
      setText("");
      qc.invalidateQueries({ queryKey: ["chat_messages", active.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setSending(false);
      taRef.current?.focus();
    }
  }

  async function sendFiles(list: FileList | null) {
    if (!list || !list.length) return;
    if (!active) {
      const incoming = Array.from(list);
      setPendingFiles((prev) => [...prev, ...incoming]);
      toast.success(
        `${incoming.length} arquivo(s) prontos. Agora diga ou digite: "criar pasta NOME".`,
      );
      if (fileRef.current) fileRef.current.value = "";
      taRef.current?.focus();
      return;
    }
    const target = active;
    setSending(true);
    try {
      const { data: ud } = await supabase.auth.getUser();
      for (const file of Array.from(list)) {
        const cat: CategoryId = detectCategory(file);
        const saved = await uploadToFolder({
          folderId: target.id,
          saleId: target.sale_id ?? null,
          cardId: target.kanban_card_id ?? null,
          file,
          category: cat,
          userId: ud.user?.id ?? null,
        });
        await supabase.from("project_folder_messages" as any).insert({
          folder_id: target.id,
          sale_id: target.sale_id,
          kanban_card_id: target.kanban_card_id,
          file_url: saved.file_url,
          file_id: saved.id,
          sender_id: ud.user?.id,
        });
      }
      toast.success("Enviado");
      qc.invalidateQueries({ queryKey: ["chat_messages", target.id] });
      qc.invalidateQueries({ queryKey: ["project_folder_files", target.id] });
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao enviar");
    } finally {
      setSending(false);
    }
  }

  /** Convert Blob → base64 (no data URL prefix). */
  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => {
        const s = String(r.result ?? "");
        const idx = s.indexOf(",");
        resolve(idx >= 0 ? s.slice(idx + 1) : s);
      };
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function toggleRecord() {
    if (recording) {
      recRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 48000,
        } as MediaTrackConstraints,
      });
      // Pick the best supported mime for clearer voice capture.
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
      ];
      const mimeType =
        mimeCandidates.find((m) =>
          typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m),
        ) ?? "";
      const mr = new MediaRecorder(
        stream,
        mimeType ? { mimeType, audioBitsPerSecond: 128000 } : { audioBitsPerSecond: 128000 },
      );
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setSending(true);
        try {
          const base64 = await blobToBase64(blob);
          const res = await transcribe({ data: { audio_base64: base64, format: "webm" } });
          const transcript = (res?.text ?? "").trim();
          const cmdName = transcript ? parseCreateFolderCommand(transcript) : null;
          if (cmdName) {
            const created = await createFolderFromCommand(cmdName);
            if (pendingFiles.length) {
              await uploadFilesToFolder(created.id, pendingFiles);
              toast.success(`${pendingFiles.length} arquivo(s) enviados para a pasta`);
            }
            resetChat();
            return;
          }
          if (!active) {
            toast.error('Selecione uma pasta ativa antes de gravar — ou diga "criar pasta NOME".');
            return;
          }
          // Save the actual audio so it can be played back (WhatsApp-style).
          const { data: ud } = await supabase.auth.getUser();
          const audioFile = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
          const saved = await uploadToFolder({
            folderId: active.id,
            saleId: active.sale_id ?? null,
            cardId: active.kanban_card_id ?? null,
            file: audioFile,
            category: "audios",
            userId: ud.user?.id ?? null,
          });
          await supabase.from("project_folder_messages" as any).insert({
            folder_id: active.id,
            sale_id: active.sale_id,
            kanban_card_id: active.kanban_card_id,
            message: transcript ? `🎙 ${transcript}` : null,
            file_url: saved.file_url,
            file_id: saved.id,
            sender_id: ud.user?.id,
          });
          qc.invalidateQueries({ queryKey: ["chat_messages", active.id] });
          qc.invalidateQueries({ queryKey: ["project_folder_files", active.id] });
        } catch (e: any) {
          toast.error(e?.message ?? "Erro na transcrição");
        } finally {
          setSending(false);
        }
      };
      // Emit a chunk every 250ms so very short presses still capture audio.
      mr.start(250);
      recRef.current = mr;
      setRecording(true);
    } catch (e: any) {
      toast.error("Não foi possível acessar o microfone");
    }
  }

  function copy(url: string) {
    try {
      navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch { toast.error("Não foi possível copiar"); }
  }

  return (
    <div className="h-[calc(100vh-3rem)] flex">
      <aside className="w-72 border-r flex flex-col">
        <div className="p-3 border-b">
          <div className="flex items-center gap-2 mb-2">
            <MessagesSquare className="w-5 h-5 text-primary" />
            <h2 className="font-semibold">Chat Organizador</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente..." className="pl-7 h-8 text-sm" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredFolders.map((f: any) => (
            <button
              key={f.id}
              onClick={() => setActiveFolderId(f.id)}
              className={`w-full text-left px-3 py-2 border-b hover:bg-muted/50 ${activeFolderId === f.id ? "bg-muted" : ""}`}
            >
              <div className="text-sm font-medium truncate">{f.client_name}</div>
              <div className="text-xs text-muted-foreground truncate">{f.service_type}</div>
            </button>
          ))}
          {filteredFolders.length === 0 && (
            <div className="p-4 text-xs text-muted-foreground">Nenhuma pasta.</div>
          )}
        </div>
      </aside>

      <section className="flex-1 flex flex-col">
        <header className="border-b px-4 py-3 flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[220px]">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Pasta ativa</div>
            <Select value={activeFolderId ?? ""} onValueChange={(v) => setActiveFolderId(v)}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={folders.isLoading ? "Carregando pastas..." : "Selecione uma pasta"} />
              </SelectTrigger>
              <SelectContent>
                {filteredFolders.map((f: any) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.client_name} — {f.service_type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {active && (
            <Link to="/pastas-arquivos/$folderId" params={{ folderId: active.id }}>
              <Button size="sm" variant="outline">
                <FolderOpen className="w-4 h-4 mr-1" /> Abrir pasta
              </Button>
            </Link>
          )}
          <div className="text-xs text-muted-foreground max-w-md">
            💡 Diga ou digite <strong>"criar pasta NOME"</strong> para gerar uma pasta automaticamente. Mande áudio, foto, vídeo ou PDF para a pasta ativa.
          </div>
        </header>
        {lastCreated && (
          <div className="border-b bg-primary/5 px-4 py-3 flex items-center justify-between gap-2">
            <div className="text-sm">
              ✅ <strong>Pasta "{lastCreated.name}" criada com sucesso.</strong>{" "}
              <span className="text-muted-foreground">Link já copiado — cole no card do Kanban ou na venda.</span>
            </div>
            <Button size="sm" variant="outline"
              onClick={() => copy(`${window.location.origin}/pastas-arquivos/${lastCreated.id}`)}>
              <Copy className="w-3 h-3 mr-1" /> Copiar link
            </Button>
          </div>
        )}
        <>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
              {!active && (
                <div className="text-center text-muted-foreground text-sm py-8 space-y-2">
                  <FolderPlus className="w-10 h-10 mx-auto opacity-50" />
                  <div className="font-medium">Envie todos seus arquivos para criar a pasta.</div>
                  <div className="text-xs max-w-md mx-auto">
                    Depois de enviar todos seus arquivos, a pasta é criada automaticamente.
                    <br />
                    <strong>Digitando:</strong> escreva <em>"criar pasta NOME"</em> e pressione Enter.
                    <br />
                    <strong>Por áudio:</strong> toque no microfone <Mic className="inline w-3 h-3" /> e diga <em>"criar pasta NOME"</em>.
                  </div>
                </div>
              )}
              {(msgs.data ?? []).map((m: any) => {
                const mine = currentUserId && m.sender_id === currentUserId;
                return (
                  <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <Card className={`max-w-[75%] ${mine ? "bg-primary text-primary-foreground" : "bg-card"}`}>
                      <CardContent className="p-2 space-y-1">
                        {m.message && <div className="text-sm whitespace-pre-wrap break-words">{m.message}</div>}
                        {m.file_url && <MediaPart path={m.file_url} />}
                        <div className={`text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"} text-right`}>
                          {new Date(m.created_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              })}
            </div>
            <footer className="border-t p-3 space-y-2">
              <div className="flex items-end gap-2">
                <Textarea
                  ref={taRef}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder='Digite uma mensagem ou: "criar pasta CLIENTE"'
                  className="min-h-[50px] flex-1"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendText(); }
                  }}
                />
                <div className="flex flex-col gap-1">
                  <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => sendFiles(e.target.files)} />
                  <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} disabled={sending} title="Anexar arquivo (se não houver pasta ativa, será solicitado o nome)">
                    <Paperclip className="w-4 h-4" />
                  </Button>
                  <Button size="icon" variant={recording ? "destructive" : "outline"} onClick={toggleRecord} disabled={sending && !recording} title='Gravar áudio (diga "criar pasta NOME")'>
                    {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                  </Button>
                  <Button size="icon" onClick={sendText} disabled={sending || !text.trim()} title="Enviar">
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
                <strong>Envie todos seus arquivos para criar a pasta.</strong> Depois de enviar, a pasta é criada automaticamente.
                <br />
                <strong>Digitando:</strong> <em>"criar pasta NOME"</em> + Enter &nbsp;•&nbsp;
                <strong>Áudio:</strong> toque no <Mic className="inline w-3 h-3" /> e diga <em>"criar pasta NOME"</em>.
              </div>
            </footer>
        </>
      </section>
    </div>
  );
}

/** Inline media renderer: image/video/audio play directly; others get a download link. */
function MediaPart({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getSignedUrl(path).then((u) => { if (alive) setUrl(u); }).catch(() => {});
    return () => { alive = false; };
  }, [path]);
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "avif"].includes(ext);
  const isVideo = ["mp4", "mov", "webm", "mkv"].includes(ext);
  const isAudio = ["webm", "mp3", "wav", "m4a", "ogg", "oga"].includes(ext) && !isVideo;
  // webm can be audio or video; prefer audio when path contains "audio"
  const isVoice = ext === "webm" && path.includes("/audios/");
  if (!url) return <div className="text-xs text-muted-foreground">Carregando mídia…</div>;
  if (isVoice || (isAudio && !isVideo)) {
    return <audio controls src={url} className="max-w-full" preload="metadata" />;
  }
  if (isImage) {
    return <img src={url} alt="anexo" className="max-w-full rounded max-h-72 object-contain" />;
  }
  if (isVideo) {
    return <video controls src={url} className="max-w-full rounded max-h-72" />;
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs underline">
      <FileText className="w-3 h-3" /> Abrir arquivo
    </a>
  );
}