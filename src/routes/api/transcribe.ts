import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AUDIO_LIMIT = 25 * 1024 * 1024;
const GEMINI_AUDIO_LIMIT = 14 * 1024 * 1024;
const AUDIO_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

async function authenticate(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!token || !url || !key) return false;

  const client = createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return false;
  const { data: permitted, error: permissionError } = await client.rpc("has_permission", {
    _user_id: userId,
    _module: "transcription",
    _action: "create",
  });
  return !permissionError && permitted === true;
}

async function transcribeAudio(file: File, apiKey: string) {
  const upstream = new FormData();
  upstream.append(
    "model",
    file.size > GEMINI_AUDIO_LIMIT ? "openai/gpt-4o-transcribe" : "google/gemini-3.5-transcribe",
  );
  upstream.append("file", file, file.name);
  upstream.append("stream", "true");

  return fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: upstream,
  });
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!(await authenticate(request))) {
          return jsonError("Sua sessão expirou. Entre novamente para continuar.", 401);
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return jsonError("O serviço de transcrição não está configurado.", 503);

        const contentLength = Number(request.headers.get("content-length") ?? 0);
        if (contentLength > AUDIO_LIMIT + 1024 * 1024) {
          return jsonError("O trecho enviado excede o limite permitido.", 413);
        }

        let form: FormData;
        try {
          form = await request.formData();
        } catch {
          return jsonError("Não foi possível ler o arquivo enviado.", 400);
        }

        const entry = form.get("file");
        if (!(entry instanceof File) || entry.size === 0) {
          return jsonError("Selecione um arquivo de áudio ou vídeo válido.", 400);
        }

        const mime = entry.type.toLowerCase();
        if (!AUDIO_TYPES.has(mime)) {
          return jsonError("Formato não aceito. Envie MP3, WAV, M4A, OGG, MP4, MOV ou WEBM.", 400);
        }
        if (entry.size > AUDIO_LIMIT) {
          return jsonError("O trecho de áudio deve ter no máximo 25 MB.", 413);
        }

        const upstream = await transcribeAudio(entry, apiKey);

        if (!upstream.ok) {
          const detail = await upstream.text().catch(() => "");
          let message = "Não foi possível transcrever este arquivo.";
          try {
            const parsed = JSON.parse(detail) as { error?: { message?: string } | string; message?: string };
            message =
              (typeof parsed.error === "string" ? parsed.error : parsed.error?.message) ??
              parsed.message ??
              message;
          } catch {
            if (detail.trim()) message = detail.slice(0, 500);
          }
          return jsonError(message, upstream.status);
        }

        return new Response(upstream.body, {
          status: 200,
          headers: {
            "Content-Type": upstream.headers.get("content-type") ?? "text/event-stream; charset=utf-8",
            "Cache-Control": "no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      },
    },
  },
});
