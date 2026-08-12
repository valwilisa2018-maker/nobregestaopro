import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Extrai o caminho do objeto dentro do bucket a partir de um valor salvo,
 * que pode ser um caminho puro ou uma URL antiga (pública/assinada).
 */
export function storagePathFromValue(bucket: string, value?: string | null): string | null {
  if (!value) return null;
  const marker = `/${bucket}/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return value.startsWith("http") ? null : value;
  const raw = value.slice(idx + marker.length).split("?")[0];
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/** Gera uma URL assinada temporária para um objeto de bucket privado. */
export async function getSignedUrl(
  bucket: string,
  value?: string | null,
  expiresIn = 3600,
): Promise<string | null> {
  const path = storagePathFromValue(bucket, value);
  if (!path) return null;

  // producer-avatars é um bucket público. A política de listagem/leitura via
  // API foi removida por segurança, mas os objetos continuam disponíveis pelo
  // CDN público; tentar assinar a URL faria as fotos desaparecerem da interface.
  if (bucket === "producer-avatars") {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path);
    return data.publicUrl;
  }

  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/** Hook para exibir arquivos de buckets privados (ex.: avatares). */
export function useSignedUrl(bucket: string, value?: string | null, expiresIn = 3600) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    if (!value) {
      setUrl(null);
      return;
    }
    getSignedUrl(bucket, value, expiresIn).then((u) => {
      if (active) setUrl(u);
    });
    return () => {
      active = false;
    };
  }, [bucket, value, expiresIn]);
  return url;
}

/** Abre um arquivo privado em nova aba usando URL assinada. */
export async function openSignedUrl(bucket: string, value?: string | null) {
  const url = await getSignedUrl(bucket, value, 3600);
  if (url) window.open(url, "_blank", "noopener,noreferrer");
}
