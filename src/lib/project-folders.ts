import { supabase } from "@/integrations/supabase/client";

export const CATEGORIES = [
  { id: "roteiro", label: "Roteiro" },
  { id: "imagens", label: "Imagens" },
  { id: "videos", label: "Vídeos" },
  { id: "pdfs", label: "PDFs" },
  { id: "referencias", label: "Referências" },
  { id: "audios", label: "Áudios" },
  { id: "entrega_final", label: "Entrega Final" },
  { id: "outros", label: "Outros" },
] as const;

export type CategoryId = (typeof CATEGORIES)[number]["id"];

export function detectCategory(file: File): CategoryId {
  const t = file.type.toLowerCase();
  if (t.startsWith("image/")) return "imagens";
  if (t.startsWith("video/")) return "videos";
  if (t.startsWith("audio/")) return "audios";
  if (t === "application/pdf") return "pdfs";
  return "outros";
}

const CATEGORY_KEYWORDS: Record<CategoryId, string[]> = {
  roteiro: ["roteiro", "script"],
  imagens: ["imagem", "imagens", "foto", "fotos", "picture"],
  videos: ["video", "vídeo", "videos", "vídeos", "filme"],
  pdfs: ["pdf", "documento", "doc"],
  referencias: ["referencia", "referência", "referencias", "referências", "ref"],
  audios: ["audio", "áudio", "audios", "áudios", "voz"],
  entrega_final: ["entrega final", "entrega", "final", "delivery"],
  outros: [],
};

export function parseCommandCategory(text: string): CategoryId | null {
  const t = text.toLowerCase();
  for (const cat of (Object.keys(CATEGORY_KEYWORDS) as CategoryId[])) {
    for (const kw of CATEGORY_KEYWORDS[cat]) {
      if (kw && t.includes(kw)) return cat;
    }
  }
  return null;
}

export async function uploadToFolder(opts: {
  folderId: string;
  saleId: string | null;
  cardId: string | null;
  file: File;
  category: CategoryId;
  userId: string | null;
}) {
  const { folderId, saleId, cardId, file, category, userId } = opts;
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const scope = saleId ?? folderId;
  const path = `${scope}/${category}/${Date.now()}-${safeName}`;
  const { error: upErr } = await supabase.storage.from("project-files").upload(path, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (upErr) throw upErr;
  const { data, error } = await supabase
    .from("project_folder_files" as any)
    .insert({
      folder_id: folderId,
      sale_id: saleId,
      kanban_card_id: cardId,
      file_name: file.name,
      file_url: path,
      file_type: file.type,
      file_size: file.size,
      file_category: category,
      uploaded_by: userId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as any;
}

export async function getSignedUrl(path: string, expires = 3600) {
  const { data, error } = await supabase.storage.from("project-files").createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}