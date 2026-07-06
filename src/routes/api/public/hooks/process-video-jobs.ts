import { createFileRoute } from "@tanstack/react-router";

const MEDIA_BUCKET = "agent-media";
const HARD_MAX = 150 * 1024 * 1024; // 150 MB por vídeo

export const Route = createFileRoute("/api/public/hooks/process-video-jobs")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key");
        if (!apikey || apikey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Pega o job pendente mais antigo (limita processamento a 1 por chamada).
        const { data: jobs } = await supabaseAdmin
          .from("video_jobs")
          .select("*")
          .eq("status", "pending")
          .lte("attempts", 3)
          .order("created_at", { ascending: true })
          .limit(1);
        const job = jobs?.[0] as VideoJob | undefined;
        if (!job) return Response.json({ ok: true, idle: true });

        // Marca running (best-effort; se outro worker pegou, ainda seguro pelo attempts++).
        await supabaseAdmin
          .from("video_jobs")
          .update({ status: "running", attempts: (job.attempts ?? 0) + 1 } as never)
          .eq("id", job.id);

        try {
          if (job.declared_bytes && job.declared_bytes > HARD_MAX) {
            throw new Error(`Vídeo maior que ${HARD_MAX / 1024 / 1024} MB (${(job.declared_bytes / 1024 / 1024).toFixed(1)} MB).`);
          }
          const url = /^https?:\/\//i.test(job.direct_path) ? job.direct_path : `https://mmg.whatsapp.net${job.direct_path}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          const encrypted = new Uint8Array(await res.arrayBuffer());
          if (encrypted.byteLength > HARD_MAX + 1024 * 1024) {
            throw new Error(`Arquivo baixado maior que o limite (${(encrypted.byteLength / 1024 / 1024).toFixed(1)} MB).`);
          }
          const mediaKey = Uint8Array.from(Buffer.from(job.media_key, "base64"));
          const decrypted = await decryptWhatsAppMedia(encrypted, mediaKey, (job.kind as MediaKind) ?? "video");

          const mime = job.mime ?? "video/mp4";
          const ext = (mime.split("/")[1] || "mp4").split(";")[0];
          const safeName = (job.file_name ?? `video-${job.id}.${ext}`).replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80);
          const finalName = safeName.includes(".") ? safeName : `${safeName}.${ext}`;
          const path = `${job.user_id}/${job.conversation_id}/${Date.now()}-${job.id}-${finalName}`;

          const { error: upErr } = await supabaseAdmin.storage
            .from(MEDIA_BUCKET)
            .upload(path, decrypted, { contentType: mime, upsert: false });
          if (upErr) throw new Error(upErr.message);
          const { data: signed } = await supabaseAdmin.storage
            .from(MEDIA_BUCKET)
            .createSignedUrl(path, 60 * 60 * 24 * 30);
          const mediaUrl = signed?.signedUrl ?? null;

          await supabaseAdmin
            .from("video_jobs")
            .update({ status: "done", storage_path: path, media_url: mediaUrl, error: null } as never)
            .eq("id", job.id);

          if (job.message_id) {
            const { data: msg } = await supabaseAdmin
              .from("messages")
              .select("metadata,content")
              .eq("id", job.message_id)
              .maybeSingle();
            const meta = { ...((msg?.metadata as Record<string, unknown>) ?? {}), storagePath: path, mime, pending: false };
            const content = (msg?.content ?? "").startsWith("⏳") ? "🎬 Vídeo" : (msg?.content ?? "🎬 Vídeo");
            await supabaseAdmin
              .from("messages")
              .update({ media_url: mediaUrl, metadata: meta as never, content } as never)
              .eq("id", job.message_id);
          }
          return Response.json({ ok: true, jobId: job.id, bytes: decrypted.byteLength });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          const attempts = (job.attempts ?? 0) + 1;
          const failed = attempts >= 3;
          await supabaseAdmin
            .from("video_jobs")
            .update({ status: failed ? "failed" : "pending", error: msg } as never)
            .eq("id", job.id);
          if (failed && job.message_id) {
            const { data: msg } = await supabaseAdmin
              .from("messages")
              .select("metadata")
              .eq("id", job.message_id)
              .maybeSingle();
            const meta = { ...((msg?.metadata as Record<string, unknown>) ?? {}), pending: false, error: msg };
            await supabaseAdmin
              .from("messages")
              .update({ content: `⚠️ Falha ao baixar vídeo: ${msg}`, metadata: meta as never } as never)
              .eq("id", job.message_id);
          }
          await supabaseAdmin.from("logs").insert({
            user_id: job.user_id,
            level: failed ? "error" : "warn",
            source: "video-jobs",
            message: failed ? `job ${job.id} failed permanently` : `job ${job.id} attempt ${attempts} failed`,
            metadata: { jobId: job.id, error: msg } as never,
          } as never);
          return Response.json({ ok: false, jobId: job.id, error: msg }, { status: 200 });
        }
      },
    },
  },
});

type MediaKind = "image" | "video" | "audio" | "document" | "sticker";
type VideoJob = {
  id: string;
  user_id: string;
  message_id: string | null;
  conversation_id: string;
  direct_path: string;
  media_key: string;
  mime: string | null;
  file_name: string | null;
  kind: string;
  declared_bytes: number | null;
  attempts: number | null;
};

async function decryptWhatsAppMedia(encryptedWithMac: Uint8Array, mediaKey: Uint8Array, kind: MediaKind) {
  const info = kind === "video" ? "WhatsApp Video Keys"
    : kind === "audio" ? "WhatsApp Audio Keys"
      : kind === "document" ? "WhatsApp Document Keys"
        : "WhatsApp Image Keys";
  const material = await hkdf(mediaKey, info, 112);
  const iv = material.slice(0, 16);
  const cipherKey = material.slice(16, 48);
  const encrypted = encryptedWithMac.slice(0, Math.max(0, encryptedWithMac.byteLength - 10));
  const key = await crypto.subtle.importKey("raw", ab(cipherKey), { name: "AES-CBC" }, false, ["decrypt"]);
  const out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ab(iv) }, key, ab(encrypted));
  return new Uint8Array(out);
}

async function hkdf(keyMaterial: Uint8Array, infoText: string, length: number) {
  const key = await crypto.subtle.importKey("raw", ab(keyMaterial), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: ab(new Uint8Array(32)), info: ab(new TextEncoder().encode(infoText)) },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

function ab(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer as ArrayBuffer;
}