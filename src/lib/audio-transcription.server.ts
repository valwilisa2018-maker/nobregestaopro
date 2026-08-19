import type { SupabaseClient } from "@supabase/supabase-js";

const LOVABLE_AUDIO_ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";
const OPENAI_AUDIO_ENDPOINT = "https://api.openai.com/v1/audio/transcriptions";
const LOVABLE_AUDIO_MODEL = "openai/gpt-4o-mini-transcribe";
const OPENAI_AUDIO_MODEL = "gpt-4o-mini-transcribe";
const MAX_AUDIO_BYTES = 24 * 1024 * 1024;

type ProviderRow = {
  provider: string | null;
  api_key: string | null;
  model: string | null;
};

type ResolvedAudioProvider = {
  endpoint: string;
  apiKey: string;
  model: string;
  provider: "lovable" | "openai";
};

export type AudioTranscriptionResult = {
  text: string | null;
  mime: string;
  ext: string;
  bytes: number;
  provider?: "lovable" | "openai";
  status?: number;
  error?: string;
};

async function loadActiveProviderRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderRow | null> {
  let { data } = await supabase
    .from("ai_providers")
    .select("provider,api_key,model")
    .eq("user_id", userId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    const { data: adminIds } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "master"]);
    const ids = (adminIds ?? []).map((row) => row.user_id);
    if (ids.length) {
      const { data: globalRow } = await supabase
        .from("ai_providers")
        .select("provider,api_key,model")
        .in("user_id", ids)
        .eq("is_active", true)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (globalRow) data = globalRow;
    }
  }

  return (data as ProviderRow | null) ?? null;
}

async function loadFallbackOpenAIRow(
  supabase: SupabaseClient,
  userId: string,
): Promise<ProviderRow | null> {
  let { data } = await supabase
    .from("ai_providers")
    .select("provider,api_key,model")
    .eq("user_id", userId)
    .eq("provider", "openai")
    .not("api_key", "is", null)
    .neq("api_key", "")
    .order("is_active", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) {
    const { data: adminIds } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "master"]);
    const ids = (adminIds ?? []).map((row) => row.user_id);
    if (ids.length) {
      const { data: globalRow } = await supabase
        .from("ai_providers")
        .select("provider,api_key,model")
        .in("user_id", ids)
        .eq("provider", "openai")
        .not("api_key", "is", null)
        .neq("api_key", "")
        .order("is_active", { ascending: false })
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (globalRow) data = globalRow;
    }
  }

  return (data as ProviderRow | null) ?? null;
}

async function resolveAudioProvider(
  supabase: SupabaseClient,
  userId: string,
): Promise<ResolvedAudioProvider | null> {
  const active = await loadActiveProviderRow(supabase, userId);
  const activeProvider = (active?.provider ?? "lovable").toLowerCase();
  if (activeProvider === "openai" && active?.api_key) {
    return {
      endpoint: OPENAI_AUDIO_ENDPOINT,
      apiKey: active.api_key,
      model: OPENAI_AUDIO_MODEL,
      provider: "openai",
    };
  }

  const lovableKey = process.env.LOVABLE_API_KEY ?? "";
  if (lovableKey) {
    return {
      endpoint: LOVABLE_AUDIO_ENDPOINT,
      apiKey: lovableKey,
      model: LOVABLE_AUDIO_MODEL,
      provider: "lovable",
    };
  }

  const openaiEnvKey = process.env.OPENAI_API_KEY ?? "";
  if (openaiEnvKey) {
    return {
      endpoint: OPENAI_AUDIO_ENDPOINT,
      apiKey: openaiEnvKey,
      model: OPENAI_AUDIO_MODEL,
      provider: "openai",
    };
  }

  const fallbackOpenAI = await loadFallbackOpenAIRow(supabase, userId);
  if (fallbackOpenAI?.api_key) {
    return {
      endpoint: OPENAI_AUDIO_ENDPOINT,
      apiKey: fallbackOpenAI.api_key,
      model: OPENAI_AUDIO_MODEL,
      provider: "openai",
    };
  }

  return null;
}

function stripDataUri(value: string) {
  return value.replace(/^data:[^;]+;base64,/, "");
}

function detectAudioContainer(bytes: Uint8Array, declaredMime?: string | null) {
  const lower = (declaredMime ?? "").toLowerCase();
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53)
    return { mime: "audio/ogg", ext: "ogg" };
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33)
    return { mime: "audio/mpeg", ext: "mp3" };
  if (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) return { mime: "audio/mpeg", ext: "mp3" };
  if (bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46)
    return { mime: "audio/wav", ext: "wav" };
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70)
    return { mime: "audio/mp4", ext: "mp4" };
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3)
    return { mime: "audio/webm", ext: "webm" };
  if (lower.includes("mp3") || lower.includes("mpeg")) return { mime: "audio/mpeg", ext: "mp3" };
  if (lower.includes("wav")) return { mime: "audio/wav", ext: "wav" };
  if (lower.includes("mp4") || lower.includes("m4a")) return { mime: "audio/mp4", ext: "mp4" };
  if (lower.includes("webm")) return { mime: "audio/webm", ext: "webm" };
  return { mime: "audio/ogg", ext: "ogg" };
}

function extractTranscript(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const json = payload as Record<string, unknown>;
  const text = json.text;
  if (typeof text === "string" && text.trim()) return text.trim();
  const transcript = json.transcript;
  if (typeof transcript === "string" && transcript.trim()) return transcript.trim();
  return null;
}

export async function transcribeAudioBase64(params: {
  supabase: SupabaseClient;
  userId: string;
  audioBase64: string;
  mime?: string | null;
}): Promise<AudioTranscriptionResult> {
  const bin = Buffer.from(stripDataUri(params.audioBase64).replace(/\s/g, ""), "base64");
  const detected = detectAudioContainer(bin, params.mime);

  if (bin.byteLength < 200) {
    return {
      text: null,
      mime: detected.mime,
      ext: detected.ext,
      bytes: bin.byteLength,
      error: `audio too small (${bin.byteLength}B)`,
    };
  }

  if (bin.byteLength > MAX_AUDIO_BYTES) {
    return {
      text: null,
      mime: detected.mime,
      ext: detected.ext,
      bytes: bin.byteLength,
      error: `audio too large (${bin.byteLength}B > 25MB)`,
    };
  }

  const provider = await resolveAudioProvider(params.supabase, params.userId);
  if (!provider) {
    return {
      text: null,
      mime: detected.mime,
      ext: detected.ext,
      bytes: bin.byteLength,
      error:
        "Nenhum provedor de STT configurado. Defina LOVABLE_API_KEY, OPENAI_API_KEY ou uma chave ativa da OpenAI em Configuracoes Globais.",
    };
  }

  const attempt = async (mime: string, ext: string) => {
    const blob = new Blob([new Uint8Array(bin)], { type: mime });
    const fd = new FormData();
    fd.append("file", blob, `audio.${ext}`);
    fd.append("model", provider.model);
    fd.append("language", "pt");
    const response = await fetch(provider.endpoint, {
      method: "POST",
      headers: { Authorization: `Bearer ${provider.apiKey}` },
      body: fd,
    });
    const bodyText = await response.text().catch(() => "");
    if (!response.ok) {
      return {
        ok: false as const,
        status: response.status,
        error: bodyText.slice(0, 500) || `HTTP ${response.status}`,
      };
    }
    let json: unknown = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      json = null;
    }
    return {
      ok: true as const,
      text: extractTranscript(json),
    };
  };

  const tried = new Set<string>();
  const containers = [
    { mime: detected.mime, ext: detected.ext },
    { mime: "audio/ogg", ext: "ogg" },
    { mime: "audio/webm", ext: "webm" },
    { mime: "audio/mpeg", ext: "mp3" },
    { mime: "audio/mp4", ext: "m4a" },
    { mime: "audio/wav", ext: "wav" },
  ].filter((candidate) => {
    const key = `${candidate.mime}:${candidate.ext}`;
    if (tried.has(key)) return false;
    tried.add(key);
    return true;
  });

  let lastFailure: { status?: number; error?: string } = {};
  for (const candidate of containers) {
    const result = await attempt(candidate.mime, candidate.ext);
    if (result.ok) {
      return {
        text: result.text,
        mime: candidate.mime,
        ext: candidate.ext,
        bytes: bin.byteLength,
        provider: provider.provider,
      };
    }
    lastFailure = result;
  }

  return {
    text: null,
    mime: detected.mime,
    ext: detected.ext,
    bytes: bin.byteLength,
    provider: provider.provider,
    status: lastFailure.status,
    error: lastFailure.error,
  };
}
