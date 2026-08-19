import { createFileRoute } from "@tanstack/react-router";

const MEDIA_BUCKET = "agent-media";
const HARD_MAX = 150 * 1024 * 1024; // 150 MB por vÃ­deo

export const Route = createFileRoute("/api/public/hooks/process-video-jobs")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST with Authorization: Bearer <FOLLOWUP_TRIGGER_SECRET>",
        }),
      POST: async ({ request }) => {
        const auth = request.headers.get("authorization") ?? "";
        const bearer = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
        const apikey = request.headers.get("apikey") ?? request.headers.get("x-api-key") ?? "";
        const token = bearer || apikey;
        if (!token) return new Response("Unauthorized", { status: 401 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cfg } = await supabaseAdmin
          .from("internal_config" as never)
          .select("value")
          .eq("key", "followup_trigger_secret")
          .maybeSingle<{ value: string }>();
        const expected = cfg?.value ?? process.env.FOLLOWUP_TRIGGER_SECRET ?? "";
        if (!expected || token !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { data: jobs } = await supabaseAdmin
          .from("video_jobs")
          .select("*")
          .eq("status", "pending")
          .or("attempts.is.null,attempts.lt.3")
          .order("created_at", { ascending: true })
          .limit(1);
        const job = jobs?.[0] as VideoJob | undefined;
        if (!job) return Response.json({ ok: true, idle: true });

        const { data: claimedJob } = await supabaseAdmin
          .from("video_jobs")
          .update({
            status: "running",
            attempts: (job.attempts ?? 0) + 1,
            error: null,
          } as never)
          .eq("id", job.id)
          .eq("status", "pending")
          .select("*")
          .maybeSingle();
        const activeJob = claimedJob as VideoJob | undefined;
        if (!activeJob) return Response.json({ ok: true, idle: true, contended: true });

        try {
          if (activeJob.declared_bytes && activeJob.declared_bytes > HARD_MAX) {
            throw new Error(
              `VÃ­deo maior que ${HARD_MAX / 1024 / 1024} MB (${(activeJob.declared_bytes / 1024 / 1024).toFixed(1)} MB).`,
            );
          }
          const url = /^https?:\/\//i.test(activeJob.direct_path)
            ? activeJob.direct_path
            : `https://mmg.whatsapp.net${activeJob.direct_path}`;
          const res = await fetch(url);
          if (!res.ok) throw new Error(`fetch ${res.status}`);
          const encrypted = new Uint8Array(await res.arrayBuffer());
          if (encrypted.byteLength > HARD_MAX + 1024 * 1024) {
            throw new Error(
              `Arquivo baixado maior que o limite (${(encrypted.byteLength / 1024 / 1024).toFixed(1)} MB).`,
            );
          }
          const mediaKey = Uint8Array.from(Buffer.from(activeJob.media_key, "base64"));
          const decrypted = await decryptWhatsAppMedia(
            encrypted,
            mediaKey,
            (activeJob.kind as MediaKind) ?? "video",
          );

          const mime = activeJob.mime ?? "video/mp4";
          const ext = (mime.split("/")[1] || "mp4").split(";")[0];
          const safeName = (activeJob.file_name ?? `video-${activeJob.id}.${ext}`)
            .replace(/[^a-zA-Z0-9._-]+/g, "-")
            .slice(0, 80);
          const finalName = safeName.includes(".") ? safeName : `${safeName}.${ext}`;
          const path = `${activeJob.user_id}/${activeJob.conversation_id}/${Date.now()}-${activeJob.id}-${finalName}`;

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
            .update({
              status: "done",
              storage_path: path,
              media_url: mediaUrl,
              error: null,
            } as never)
            .eq("id", activeJob.id);

          if (activeJob.message_id) {
            const { data: msg } = await supabaseAdmin
              .from("messages")
              .select("metadata,content")
              .eq("id", activeJob.message_id)
              .maybeSingle();
            const meta = {
              ...((msg?.metadata as Record<string, unknown>) ?? {}),
              storagePath: path,
              mime,
              pending: false,
            };
            const content = (msg?.content ?? "").startsWith("â³")
              ? "ðŸŽ¬ VÃ­deo"
              : (msg?.content ?? "ðŸŽ¬ VÃ­deo");
            await supabaseAdmin
              .from("messages")
              .update({ media_url: mediaUrl, metadata: meta as never, content } as never)
              .eq("id", activeJob.message_id);
          }
          return Response.json({ ok: true, jobId: activeJob.id, bytes: decrypted.byteLength });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          const attempts = activeJob.attempts ?? (job.attempts ?? 0) + 1;
          const failed = attempts >= 3;
          await supabaseAdmin
            .from("video_jobs")
            .update({ status: failed ? "failed" : "pending", error: msg } as never)
            .eq("id", activeJob.id);
          if (failed && activeJob.message_id) {
            const { data: existingMsg } = await supabaseAdmin
              .from("messages")
              .select("metadata")
              .eq("id", activeJob.message_id)
              .maybeSingle();
            const meta = {
              ...((existingMsg?.metadata as Record<string, unknown>) ?? {}),
              pending: false,
              error: msg,
            };
            await supabaseAdmin
              .from("messages")
              .update({
                content: `âš ï¸ Falha ao baixar vÃ­deo: ${msg}`,
                metadata: meta as never,
              } as never)
              .eq("id", activeJob.message_id);
          }
          await supabaseAdmin.from("logs").insert({
            user_id: activeJob.user_id,
            level: failed ? "error" : "warn",
            source: "video-jobs",
            message: failed
              ? `job ${activeJob.id} failed permanently`
              : `job ${activeJob.id} attempt ${attempts} failed`,
            metadata: { jobId: activeJob.id, error: msg } as never,
          } as never);
          return Response.json({ ok: false, jobId: activeJob.id, error: msg }, { status: 200 });
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

async function decryptWhatsAppMedia(
  encryptedWithMac: Uint8Array,
  mediaKey: Uint8Array,
  kind: MediaKind,
) {
  const info =
    kind === "video"
      ? "WhatsApp Video Keys"
      : kind === "audio"
        ? "WhatsApp Audio Keys"
        : kind === "document"
          ? "WhatsApp Document Keys"
          : "WhatsApp Image Keys";
  const material = await hkdf(mediaKey, info, 112);
  const iv = material.slice(0, 16);
  const cipherKey = material.slice(16, 48);
  const encrypted = encryptedWithMac.slice(0, Math.max(0, encryptedWithMac.byteLength - 10));
  const key = await crypto.subtle.importKey("raw", ab(cipherKey), { name: "AES-CBC" }, false, [
    "decrypt",
  ]);
  const out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: ab(iv) }, key, ab(encrypted));
  return new Uint8Array(out);
}

async function hkdf(keyMaterial: Uint8Array, infoText: string, length: number) {
  const key = await crypto.subtle.importKey("raw", ab(keyMaterial), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    {
      name: "HKDF",
      hash: "SHA-256",
      salt: ab(new Uint8Array(32)),
      info: ab(new TextEncoder().encode(infoText)),
    },
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
