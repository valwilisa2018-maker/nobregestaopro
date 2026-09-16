import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const AUDIO_LIMIT = 25 * 1024 * 1024;
const GEMINI_AUDIO_LIMIT = 14 * 1024 * 1024;
const VIDEO_LIMIT = 300 * 1024 * 1024;
const TEMP_BUCKET = "transcription-temp";
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
const VIDEO_TYPES = new Set(["video/mp4", "video/webm", "video/quicktime", "video/mpeg"]);

function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

function userClient(token: string) {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return null;
  return createClient<Database>(url, key, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function authenticate(request: Request) {
  const authorization = request.headers.get("authorization");
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const client = userClient(token);
  if (!client) return null;

  const { data, error } = await client.auth.getClaims(token);
  const userId = data?.claims?.sub;
  if (error || !userId) return null;
  const { data: permitted, error: permissionError } = await client.rpc("has_permission", {
    _user_id: userId,
    _module: "transcription",
    _action: "create",
  });
  if (permissionError || permitted !== true) return null;
  return { client, userId };
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

async function transcribeVideo(videoUrl: string, apiKey: string) {
  return fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-3.8-flash",
      stream: true,
      messages: [
        {
          role: "system",
          content:
            "Transcreva fielmente toda a fala do vídeo. Responda somente com a transcrição, em texto corrido bem pontuado, sem comentários, introduções ou formatação Markdown. Preserve o idioma original.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Transcreva todas as falas deste vídeo." },
            { type: "video_url", video_url: { url: videoUrl } },
          ],
        },
      ],
    }),
  });
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const session = await authenticate(request);
        if (!session) {
          return jsonError("Sua sessão expirou. Entre novamente para continuar.", 401);
        }

        const apiKey = process.env["LOVABLE_API_KEY"];
        if (!apiKey) return jsonError("O serviço de transcrição não está configurado.", 503);

        const contentType = request.headers.get("content-type") ?? "";
        let upstream: Response;

        if (contentType.includes("application/json")) {
          // Vídeos grandes: o arquivo já está no armazenamento temporário.
          let payload: { path?: unknown; mime?: unknown; size?: unknown };
          try {
            payload = (await request.json()) as typeof payload;
          } catch {
            return jsonError("Não foi possível ler os dados enviados.", 400);
          }
          const path = typeof payload.path === "string" ? payload.path : "";
          const mime = typeof payload.mime === "string" ? payload.mime.toLowerCase() : "";
          const size = typeof payload.size === "number" ? payload.size : 0;
          if (!path.startsWith(`${session.userId}/`)) {
            return jsonError("Arquivo inválido para transcrição.", 400);
          }
          if (!VIDEO_TYPES.has(mime)) {
            return jsonError("Formato de vídeo não aceito. Envie MP4, MOV, WEBM ou MPEG.", 400);
          }
          if (size > VIDEO_LIMIT) {
            return jsonError("O vídeo deve ter no máximo 300 MB.", 413);
          }

          const { data: signed, error: signError } = await session.client.storage
            .from(TEMP_BUCKET)
            .createSignedUrl(path, 60 * 60);
          if (signError || !signed?.signedUrl) {
            return jsonError("Não foi possível acessar o vídeo enviado.", 400);
          }
          upstream = await transcribeVideo(signed.signedUrl, apiKey);
        } else {
          const contentLength = Number(request.headers.get("content-length") ?? 0);
          if (contentLength > AUDIO_LIMIT + 1024 * 1024) {
            return jsonError("O arquivo excede o limite permitido.", 413);
          }

          let form: FormData;
          try {
            form = await request.formData();
          } catch {
            return jsonError("Não foi possível ler o arquivo enviado.", 400);
          }

          const entry = form.get("file");
          if (!(entry instanceof File) || entry.size === 0) {
            return jsonError("Selecione um arquivo de áudio válido.", 400);
          }

          const mime = entry.type.toLowerCase();
          if (!AUDIO_TYPES.has(mime)) {
            return jsonError("Formato não aceito. Envie MP3, WAV, M4A, OGG, AAC ou FLAC.", 400);
          }
          if (entry.size > AUDIO_LIMIT) {
            return jsonError("O áudio deve ter no máximo 25 MB.", 413);
          }
          upstream = await transcribeAudio(entry, apiKey);
        }


        const upstream = isAudio
          ? await transcribeAudio(entry, apiKey)
          : await transcribeVideo(entry, apiKey);

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