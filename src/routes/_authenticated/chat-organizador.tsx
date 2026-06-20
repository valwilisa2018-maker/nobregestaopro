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
import { MessagesSquare, Send, Paperclip, Mic, Square, Search, FileText, Copy, FolderPlus, FolderOpen, ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  const [roteiroOpen, setRoteiroOpen] = useState(false);
  const [roteiroText, setRoteiroText] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const [tourStep, setTourStep] = useState(0);
  const [highlightCreate, setHighlightCreate] = useState(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id ?? null));
  }, []);

  useEffect(() => {
    try {
      if (!localStorage.getItem("chat_organizador_tour_v2")) {
        setTourOpen(true);
        setTourStep(0);
      }
    } catch {}
  }, []);

  const finishTour = () => {
    try { localStorage.setItem("chat_organizador_tour_v2", "1"); } catch {}
    setTourOpen(false);
    setHighlightCreate(true);
    setTimeout(() => setHighlightCreate(false), 6000);
  };

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

  // Do NOT auto-select a folder. The chat is exclusively for CREATING a new
  // folder — after creation the chat resets and waits for the next one.

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

  async function submitRoteiro() {
    const html = editorRef.current?.innerHTML?.trim() ?? "";
    const plain = editorRef.current?.innerText?.trim() ?? "";
    if (!plain) {
      toast.error("Cole o roteiro antes de enviar");
      return;
    }
    const fileName = `roteiro-${new Date().toISOString().replace(/[:.]/g, "-")}.html`;
    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>Roteiro</title><style>body{font-family:Arial,sans-serif;max-width:820px;margin:32px auto;padding:0 24px;line-height:1.6;color:#111}</style></head><body>${html}</body></html>`;
    const file = new File([doc], fileName, { type: "text/html" });
    // Roteiro always goes into the NEXT folder. The chat does not append to
    // an existing folder — that's done manually from "Pastas e arquivos".
    setPendingFiles((prev) => [...prev, file]);
    toast.success('Roteiro pronto. Agora diga ou digite: "criar pasta NOME".');
    setRoteiroOpen(false);
    setRoteiroText("");
  }

  async function sendText() {
    if (!text.trim()) return;
    const cmdName = parseCreateFolderCommand(text);
    if (!cmdName) {
      toast.error('Diga ou digite: "criar pasta NOME". O chat é só para criar pastas.');
      return;
    }
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
  }

  async function sendFiles(list: FileList | null) {
    if (!list || !list.length) return;
    // Files always go into the NEXT folder created via the chat.
    const incoming = Array.from(list);
    setPendingFiles((prev) => [...prev, ...incoming]);
    toast.success(
      `${incoming.length} arquivo(s) prontos. Agora diga ou digite: "criar pasta NOME".`,
    );
    if (fileRef.current) fileRef.current.value = "";
    taRef.current?.focus();
  }

  async function handleCreateFromButton() {
    const name = createName.trim();
    if (!name) {
      toast.error("Informe o nome da pasta");
      return;
    }
    setSending(true);
    try {
      const created = await createFolderFromCommand(name);
      if (pendingFiles.length) {
        await uploadFilesToFolder(created.id, pendingFiles);
        toast.success(`${pendingFiles.length} arquivo(s) enviados para a pasta`);
      }
      setCreateOpen(false);
      setCreateName("");
      resetChat();
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao criar pasta");
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
          // Audio outside of "criar pasta NOME" is not used by the chat.
          const audioFile = new File([blob], `audio-${Date.now()}.webm`, { type: "audio/webm" });
          setPendingFiles((prev) => [...prev, audioFile]);
          toast.message(
            transcript
              ? `Áudio salvo. Diga "criar pasta NOME" para criar a pasta. (transcrição: ${transcript})`
              : 'Áudio salvo. Diga "criar pasta NOME" para criar a pasta.',
          );
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
              onClick={() => {
                copy(`${window.location.origin}/pastas-arquivos/${lastCreated.id}`);
                setLastCreated(null);
                resetChat();
              }}>
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
              {pendingFiles.length > 0 && (
                <div className="rounded-md border bg-muted/40 p-2 space-y-1">
                  {(() => {
                    const roteiros = pendingFiles.filter((f) => /\.html?$/i.test(f.name) || f.type === "text/html").length;
                    const audios = pendingFiles.filter((f) => f.type.startsWith("audio/")).length;
                    const outros = pendingFiles.length - roteiros - audios;
                    return (
                      <div className="text-[11px] font-medium text-muted-foreground flex flex-wrap gap-2">
                        <span>Fila ({pendingFiles.length}):</span>
                        <span>📝 {roteiros} roteiro(s)</span>
                        <span>🎙 {audios} áudio(s)</span>
                        <span>📎 {outros} arquivo(s)</span>
                        <span className="ml-auto">diga/digite <em>"criar pasta NOME"</em></span>
                      </div>
                    );
                  })()}
                  <div className="flex flex-wrap gap-1">
                    {pendingFiles.map((f, i) => (
                      <span key={i} className="text-[10px] bg-background border rounded px-2 py-0.5 inline-flex items-center gap-1">
                        <Paperclip className="w-3 h-3" />
                        {f.name}
                        <button
                          type="button"
                          className="ml-1 text-muted-foreground hover:text-destructive"
                          onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="text-[10px] underline text-muted-foreground ml-1"
                      onClick={() => setPendingFiles([])}
                    >
                      limpar
                    </button>
                  </div>
                </div>
              )}
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
                <TooltipProvider delayDuration={150}>
                  <div className="flex flex-row flex-wrap gap-1 items-center">
                    <input ref={fileRef} type="file" multiple accept="image/*,video/*,audio/*,application/pdf,.pdf,.doc,.docx,.txt" className="hidden" onChange={(e) => sendFiles(e.target.files)} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="outline" onClick={() => fileRef.current?.click()} disabled={sending}>
                          <Paperclip className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-medium">Anexar arquivo</p>
                        <p className="text-xs opacity-80">Envia arquivos para a pasta ativa (ou pede o nome).</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant="outline" onClick={() => setRoteiroOpen(true)} disabled={sending}>
                          <ScrollText className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-medium">Roteiro</p>
                        <p className="text-xs opacity-80">Escreve ou cola um roteiro na pasta.</p>
                      </TooltipContent>
                    </Tooltip>

                    <div className={`relative ${highlightCreate ? "z-10" : ""}`}>
                      {highlightCreate && (
                        <>
                          <span className="pointer-events-none absolute inset-0 rounded-md ring-2 ring-primary animate-ping" />
                          <span className="pointer-events-none absolute left-1/2 -top-2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-primary px-2 py-1 text-[11px] font-medium text-primary-foreground shadow-md">
                            Clique aqui para criar a pasta
                          </span>
                        </>
                      )}
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button size="icon" variant={highlightCreate ? "default" : "outline"} onClick={() => { setCreateOpen(true); setHighlightCreate(false); }} disabled={sending} className={highlightCreate ? "ring-2 ring-primary" : ""}>
                            <FolderPlus className="w-4 h-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent side="top">
                          <p className="font-medium">Criar pasta</p>
                          <p className="text-xs opacity-80">Cria uma nova pasta de projeto.</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" variant={recording ? "destructive" : "outline"} onClick={toggleRecord} disabled={sending && !recording}>
                          {recording ? <Square className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-medium">{recording ? "Parar gravação" : "Gravar áudio"}</p>
                        <p className="text-xs opacity-80">Diga "criar pasta NOME" para criar por voz.</p>
                      </TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button size="icon" onClick={sendText} disabled={sending || !text.trim()}>
                          <Send className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        <p className="font-medium">Enviar</p>
                        <p className="text-xs opacity-80">Envia a mensagem digitada.</p>
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
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
      {roteiroOpen && (
        <RoteiroFullscreen
          editorRef={editorRef}
          activeName={active ? (active.client_name ?? active.folder_name) : null}
          onClose={() => { setRoteiroOpen(false); setRoteiroText(""); }}
          onSubmit={submitRoteiro}
          sending={sending}
        />
      )}
      <Dialog open={createOpen} onOpenChange={(o) => { setCreateOpen(o); if (!o) setCreateName(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar pasta</DialogTitle>
            <DialogDescription>
              Qual o nome da pasta? O link será gerado e copiado automaticamente.
              {pendingFiles.length > 0 && (
                <> Os {pendingFiles.length} arquivo(s) na fila serão enviados para a nova pasta.</>
              )}
            </DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="Ex.: Cliente João - Vídeo Institucional"
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); handleCreateFromButton(); }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={sending}>Cancelar</Button>
            <Button onClick={handleCreateFromButton} disabled={sending || !createName.trim()}>
              <FolderPlus className="w-4 h-4 mr-1" /> Criar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={tourOpen} onOpenChange={(o) => { if (!o) finishTour(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tourStep === 0 && "✨ Novidade: Criar pasta com um clique"}
              {tourStep === 1 && "1º passo — Toque no botão Criar pasta"}
              {tourStep === 2 && "2º passo — Dê um nome para a pasta"}
              {tourStep === 3 && "Pronto! Link gerado e copiado"}
            </DialogTitle>
            <DialogDescription className="pt-2 space-y-3 text-sm leading-relaxed">
              {tourStep === 0 && (
                <>
                  Agora você pode criar uma pasta direto por aqui, sem precisar usar comandos de voz ou palavras-chave.
                  Em 3 passos rápidos você terá a pasta pronta e o link já copiado.
                </>
              )}
              {tourStep === 1 && (
                <>
                  Na barra de envio à direita, procure o ícone <FolderPlus className="inline w-4 h-4 align-text-bottom" /> <strong>Criar pasta</strong>.
                  Vamos destacá-lo para você assim que fechar este tutorial.
                </>
              )}
              {tourStep === 2 && (
                <>
                  Vai abrir uma janela perguntando <em>"Qual o nome da pasta?"</em>.
                  Digite o nome (ex.: <em>Cliente João - Vídeo Institucional</em>) e confirme em <strong>Criar pasta</strong>.
                </>
              )}
              {tourStep === 3 && (
                <>
                  A pasta é criada automaticamente, o <strong>link já é copiado</strong> para sua área de transferência
                  e, se houver arquivos na fila, eles são enviados direto para ela. É só colar o link onde precisar.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={finishTour}>Pular</Button>
            {tourStep > 0 && (
              <Button variant="outline" onClick={() => setTourStep((s) => s - 1)}>Voltar</Button>
            )}
            {tourStep < 3 ? (
              <Button onClick={() => setTourStep((s) => s + 1)}>Próximo</Button>
            ) : (
              <Button onClick={finishTour}>Entendi, vou criar</Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
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

function RoteiroFullscreen({
  editorRef,
  activeName,
  onClose,
  onSubmit,
  sending,
}: {
  editorRef: React.RefObject<HTMLDivElement | null>;
  activeName: string | null;
  onClose: () => void;
  onSubmit: () => void;
  sending: boolean;
}) {
  const [color, setColor] = useState("#111111");
  const [highlight, setHighlight] = useState("#fff59d");
  const exec = (cmd: string, val?: string) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, val);
  };
  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      <div className="border-b px-4 py-3 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Roteiro</h2>
          <p className="text-xs text-muted-foreground">
            Edite à vontade — será enviado como arquivo <strong>.html</strong>{" "}
            {activeName ? `na pasta "${activeName}"` : "(será anexado ao criar a próxima pasta)"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onClose} disabled={sending}>Cancelar</Button>
          <Button onClick={onSubmit} disabled={sending}>
            <Send className="w-4 h-4 mr-1" /> Enviar roteiro
          </Button>
        </div>
      </div>
      <div className="border-b px-4 py-2 flex flex-wrap items-center gap-1 bg-muted/30">
        <select
          className="h-8 rounded border bg-background px-2 text-sm"
          onChange={(e) => exec("fontSize", e.target.value)}
          defaultValue="3"
          title="Tamanho"
        >
          <option value="1">10</option>
          <option value="2">13</option>
          <option value="3">16</option>
          <option value="4">18</option>
          <option value="5">24</option>
          <option value="6">32</option>
          <option value="7">48</option>
        </select>
        <select
          className="h-8 rounded border bg-background px-2 text-sm"
          onChange={(e) => exec("formatBlock", e.target.value)}
          defaultValue="p"
          title="Estilo"
        >
          <option value="p">Parágrafo</option>
          <option value="h1">Título 1</option>
          <option value="h2">Título 2</option>
          <option value="h3">Título 3</option>
          <option value="blockquote">Citação</option>
          <option value="pre">Código</option>
        </select>
        <div className="w-px h-6 bg-border mx-1" />
        <Button size="sm" variant="ghost" onClick={() => exec("bold")} title="Negrito"><b>B</b></Button>
        <Button size="sm" variant="ghost" onClick={() => exec("italic")} title="Itálico"><i>I</i></Button>
        <Button size="sm" variant="ghost" onClick={() => exec("underline")} title="Sublinhado"><u>U</u></Button>
        <Button size="sm" variant="ghost" onClick={() => exec("strikeThrough")} title="Tachado"><s>S</s></Button>
        <div className="w-px h-6 bg-border mx-1" />
        <label className="flex items-center gap-1 text-xs" title="Cor do texto">
          <span>A</span>
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); exec("foreColor", e.target.value); }} className="w-7 h-7 rounded border" />
        </label>
        <label className="flex items-center gap-1 text-xs" title="Marca-texto">
          <span>🖍</span>
          <input type="color" value={highlight} onChange={(e) => { setHighlight(e.target.value); exec("hiliteColor", e.target.value); }} className="w-7 h-7 rounded border" />
        </label>
        <div className="w-px h-6 bg-border mx-1" />
        <Button size="sm" variant="ghost" onClick={() => exec("insertUnorderedList")} title="Lista">• Lista</Button>
        <Button size="sm" variant="ghost" onClick={() => exec("insertOrderedList")} title="Numerada">1. Lista</Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button size="sm" variant="ghost" onClick={() => exec("justifyLeft")} title="Esquerda">⯇</Button>
        <Button size="sm" variant="ghost" onClick={() => exec("justifyCenter")} title="Centro">≡</Button>
        <Button size="sm" variant="ghost" onClick={() => exec("justifyRight")} title="Direita">⯈</Button>
        <div className="w-px h-6 bg-border mx-1" />
        <Button size="sm" variant="ghost" onClick={() => exec("removeFormat")} title="Limpar formatação">⌫ Limpar</Button>
        <Button size="sm" variant="ghost" onClick={() => exec("undo")} title="Desfazer">↶</Button>
        <Button size="sm" variant="ghost" onClick={() => exec("redo")} title="Refazer">↷</Button>
      </div>
      <div className="flex-1 overflow-auto bg-muted/10 p-6">
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="mx-auto max-w-4xl min-h-full bg-background rounded shadow-sm border p-8 outline-none focus:ring-2 focus:ring-primary/30 prose prose-sm max-w-none"
          style={{ fontFamily: "Arial, sans-serif", fontSize: 16, lineHeight: 1.6 }}
          data-placeholder="Cole ou escreva aqui o roteiro completo..."
        />
      </div>
    </div>
  );
}