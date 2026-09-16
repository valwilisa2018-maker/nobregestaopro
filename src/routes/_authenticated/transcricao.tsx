import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AudioLines,
  Check,
  Clipboard,
  Download,
  FileAudio,
  FileVideo,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  WandSparkles,
} from "lucide-react";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { getErrorMessage } from "@/lib/error-messages";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

const AUDIO_LIMIT = 25 * 1024 * 1024;
const VIDEO_LIMIT = 300 * 1024 * 1024;
const TEMP_BUCKET = "transcription-temp";

const ACCEPTED = "audio/mpeg,audio/mp4,audio/wav,audio/x-wav,audio/webm,audio/ogg,audio/aac,audio/flac,video/mp4,video/webm,video/quicktime,video/mpeg,.mp3,.wav,.m4a,.ogg,.aac,.flac,.mp4,.mov,.webm";

type Stage = "idle" | "uploading" | "transcribing" | "done" | "error";

export const Route = createFileRoute("/_authenticated/transcricao")({
  head: () => ({
    meta: [
      { title: "Transcrição de Áudio e Vídeo — Nobre MKT" },
      { name: "description", content: "Transforme arquivos de áudio e vídeo em textos editáveis com inteligência artificial." },
      { property: "og:title", content: "Transcrição de Áudio e Vídeo — Nobre MKT" },
      { property: "og:description", content: "Transcreva áudio e vídeo em um texto pronto para revisar e exportar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: TranscricaoPage,
});

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null) {
  if (seconds === null || !Number.isFinite(seconds)) return "—";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return `${minutes}:${String(rest).padStart(2, "0")}`;
}

function parseSseLines(raw: string, onText: (value: string) => void) {
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const event = JSON.parse(payload) as {
        type?: string;
        delta?: string;
        text?: string;
        choices?: Array<{ delta?: { content?: string } }>;
      };
      if (event.type === "transcript.text.delta" && event.delta) onText(event.delta);
      else if (event.type === "transcript.text.done" && event.text) onText(event.text);
      else {
        const content = event.choices?.[0]?.delta?.content;
        if (content) onText(content);
      }
    } catch {
      // Uma linha incompleta será processada quando o próximo trecho chegar.
    }
  }
}

function TranscricaoPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<XMLHttpRequest | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>("idle");
  const [progress, setProgress] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");

  const isVideo = Boolean(file?.type.startsWith("video/"));
  const wordCount = useMemo(() => transcript.trim().split(/\s+/).filter(Boolean).length, [transcript]);
  const characterCount = transcript.length;

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    requestRef.current?.abort();
  }, [previewUrl]);

  const reset = useCallback(() => {
    requestRef.current?.abort();
    requestRef.current = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setFile(null);
    setDuration(null);
    setTranscript("");
    setError("");
    setProgress(0);
    setStage("idle");
    if (inputRef.current) inputRef.current.value = "";
  }, [previewUrl]);

  const chooseFile = useCallback((next: File) => {
    const audio = next.type.startsWith("audio/");
    const video = next.type.startsWith("video/");
    if (!audio && !video) {
      toast.error("Formato não aceito. Envie um arquivo de áudio ou vídeo.");
      return;
    }
    const limit = video ? VIDEO_LIMIT : AUDIO_LIMIT;
    if (next.size === 0 || next.size > limit) {
      toast.error(video ? "O vídeo deve ter no máximo 300 MB." : "O áudio deve ter no máximo 25 MB.");
      return;
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    const nextUrl = URL.createObjectURL(next);
    setFile(next);
    setPreviewUrl(nextUrl);
    setDuration(null);
    setTranscript("");
    setError("");
    setProgress(0);
    setStage("idle");
  }, [previewUrl]);

  const startTranscription = async () => {
    if (!file) return;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !data.session?.access_token) {
      toast.error("Sua sessão expirou. Entre novamente para continuar.");
      return;
    }

    setTranscript("");
    setError("");
    setProgress(2);
    setStage("uploading");
    const form = new FormData();
    form.append("file", file, file.name);

    const xhr = new XMLHttpRequest();
    requestRef.current = xhr;
    let consumed = 0;
    let pendingLine = "";
    let streamingText = "";
    const consumeResponse = (flush = false) => {
      const fresh = pendingLine + xhr.responseText.slice(consumed);
      consumed = xhr.responseText.length;
      const lastBreak = fresh.lastIndexOf("\n");
      if (!flush && lastBreak < 0) {
        pendingLine = fresh;
        return;
      }
      const complete = flush ? fresh : fresh.slice(0, lastBreak + 1);
      pendingLine = flush ? "" : fresh.slice(lastBreak + 1);
      parseSseLines(complete, (value) => {
        if (value.length >= streamingText.length && value.startsWith(streamingText)) streamingText = value;
        else streamingText += value;
        setTranscript(streamingText.trimStart());
        setProgress((current) => Math.min(94, current + 2));
      });
    };
    xhr.open("POST", "/api/transcribe");
    xhr.setRequestHeader("Authorization", `Bearer ${data.session.access_token}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.min(45, Math.round((event.loaded / event.total) * 45)));
    };
    xhr.upload.onload = () => {
      setStage("transcribing");
      setProgress(55);
    };
    xhr.onprogress = () => {
      consumeResponse();
    };
    xhr.onload = () => {
      consumeResponse(true);
      requestRef.current = null;
      if (xhr.status >= 200 && xhr.status < 300) {
        if (!streamingText.trim()) {
          setStage("error");
          setError("Nenhuma fala clara foi encontrada neste arquivo.");
          return;
        }
        setTranscript(streamingText.trim());
        setProgress(100);
        setStage("done");
        toast.success("Transcrição concluída!");
        return;
      }
      let message = xhr.responseText;
      try { message = (JSON.parse(xhr.responseText) as { error?: string }).error ?? message; } catch { /* resposta textual */ }
      const translated = getErrorMessage(message, "Não foi possível transcrever este arquivo.");
      setError(translated);
      setStage("error");
      toast.error(translated);
    };
    xhr.onerror = () => {
      requestRef.current = null;
      const message = "Sem conexão com o servidor. Verifique sua internet e tente novamente.";
      setError(message);
      setStage("error");
      toast.error(message);
    };
    xhr.send(form);
  };

  const copyTranscript = async () => {
    if (!transcript.trim()) return;
    await navigator.clipboard.writeText(transcript);
    toast.success("Transcrição copiada!");
  };

  const downloadTranscript = () => {
    if (!transcript.trim()) return;
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${file?.name.replace(/\.[^.]+$/, "") || "transcricao"}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast.success("Arquivo TXT baixado!");
  };

  const processing = stage === "uploading" || stage === "transcribing";

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHero
        eyebrow="Inteligência artificial"
        icon={AudioLines}
        title="Transcrição de Áudio e Vídeo"
        description="Transforme gravações em textos prontos para revisar, copiar e compartilhar."
        actions={<Badge variant="outline" className="gap-1.5 py-1.5"><ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Processamento seguro</Badge>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card className="overflow-hidden border-border/60 bg-card/75 backdrop-blur-xl">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <CardTitle className="flex items-center gap-2 text-lg"><UploadCloud className="h-5 w-5 text-primary" /> Envie sua mídia</CardTitle>
            <CardDescription>Áudio até 25 MB ou vídeo até 300 MB. O arquivo é descartado após a transcrição.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 p-5 sm:p-6">
            {!file ? (
              <div
                role="button"
                tabIndex={0}
                aria-label="Selecionar áudio ou vídeo"
                onClick={() => inputRef.current?.click()}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}
                onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={(event) => { event.preventDefault(); setDragging(false); const dropped = event.dataTransfer.files?.[0]; if (dropped) chooseFile(dropped); }}
                className={cn(
                  "group grid min-h-[330px] cursor-pointer place-items-center rounded-xl border-2 border-dashed p-8 text-center transition-colors",
                  dragging ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:border-primary/60 hover:bg-primary/5",
                )}
              >
                <div className="max-w-sm space-y-4">
                  <div className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-primary/20 bg-primary/10 text-primary shadow-lg shadow-primary/10 transition-transform group-hover:scale-105">
                    <UploadCloud className="h-9 w-9" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold">Arraste o arquivo para cá</p>
                    <p className="mt-1 text-sm text-muted-foreground">ou clique para escolher no seu dispositivo</p>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">MP3</Badge><Badge variant="secondary">WAV</Badge><Badge variant="secondary">M4A</Badge><Badge variant="secondary">MP4</Badge><Badge variant="secondary">MOV</Badge><Badge variant="secondary">WEBM</Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="overflow-hidden rounded-xl border border-border bg-muted/20">
                  <div className="relative grid min-h-[220px] place-items-center bg-foreground/[0.04]">
                    {previewUrl && isVideo ? (
                      <video src={previewUrl} controls className="max-h-[300px] w-full bg-foreground/90 object-contain" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
                    ) : previewUrl ? (
                      <div className="w-full space-y-6 p-8 text-center">
                        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-primary/10 text-primary"><FileAudio className="h-11 w-11" /></div>
                        <audio src={previewUrl} controls className="mx-auto w-full max-w-md" onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)} />
                      </div>
                    ) : null}
                  </div>
                  <div className="grid gap-3 border-t border-border/60 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary/10 text-primary">{isVideo ? <FileVideo /> : <FileAudio />}</div>
                    <div className="min-w-0"><p className="truncate text-sm font-semibold">{file.name}</p><p className="text-xs text-muted-foreground">{formatBytes(file.size)} · {formatDuration(duration)}</p></div>
                    <Button variant="ghost" size="icon" onClick={reset} disabled={processing} title="Remover arquivo" aria-label="Remover arquivo"><Trash2 /></Button>
                  </div>
                </div>

                {processing && (
                  <div className="space-y-3 rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="flex items-center justify-between gap-4"><span className="flex items-center gap-2 text-sm font-medium"><Loader2 className="h-4 w-4 animate-spin text-primary" />{stage === "uploading" ? "Enviando arquivo..." : "Transcrevendo as falas..."}</span><span className="text-sm font-semibold tabular-nums text-primary">{progress}%</span></div>
                    <Progress value={progress} />
                    <p className="text-xs text-muted-foreground">Você pode acompanhar o texto aparecendo ao lado.</p>
                  </div>
                )}

                {stage === "error" && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button variant="premium" size="lg" className="flex-1" onClick={startTranscription} disabled={processing}>
                    {processing ? <Loader2 className="animate-spin" /> : <WandSparkles />}{stage === "done" ? "Transcrever novamente" : "Iniciar transcrição"}
                  </Button>
                  <Button variant="outline" size="lg" onClick={() => inputRef.current?.click()} disabled={processing}><RotateCcw /> Trocar arquivo</Button>
                </div>
              </div>
            )}
            <input ref={inputRef} type="file" accept={ACCEPTED} className="sr-only" onChange={(event) => { const selected = event.target.files?.[0]; if (selected) chooseFile(selected); }} />
          </CardContent>
        </Card>

        <Card className="flex min-h-[560px] flex-col border-border/60 bg-card/75 backdrop-blur-xl">
          <CardHeader className="border-b border-border/50 bg-muted/20">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><CardTitle className="flex items-center gap-2 text-lg"><Sparkles className="h-5 w-5 text-primary" /> Texto transcrito</CardTitle><CardDescription className="mt-1">Revise e edite livremente antes de exportar.</CardDescription></div>
              {stage === "done" && <Badge className="gap-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400"><Check className="h-3.5 w-3.5" /> Concluído</Badge>}
            </div>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4 p-5 sm:p-6">
            <Textarea
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder={processing ? "A transcrição aparecerá aqui..." : "Seu texto transcrito aparecerá aqui, pronto para revisão."}
              aria-label="Texto transcrito"
              className="min-h-[340px] flex-1 resize-y bg-background/70 text-base leading-relaxed"
            />
            <div className="grid grid-cols-3 gap-2">
              <Metric label="Palavras" value={wordCount.toLocaleString("pt-BR")} />
              <Metric label="Caracteres" value={characterCount.toLocaleString("pt-BR")} />
              <Metric label="Duração" value={formatDuration(duration)} />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={copyTranscript} disabled={!transcript.trim()}><Clipboard /> Copiar texto</Button>
              <Button variant="outline" className="flex-1" onClick={downloadTranscript} disabled={!transcript.trim()}><Download /> Baixar TXT</Button>
              <Button variant="ghost" onClick={reset} disabled={!file && !transcript}><RotateCcw /> Nova</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-border/60 bg-muted/25 p-3 text-center"><p className="text-lg font-semibold tabular-nums">{value}</p><p className="text-[10px] font-semibold uppercase text-muted-foreground">{label}</p></div>;
}