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

/**
 * Extrai o folderId de uma URL no formato .../pastas-arquivos/{uuid}
 */
export function extractFolderIdFromLink(link?: string | null): string | null {
  if (!link) return null;
  const m = link.match(/pastas-arquivos\/([0-9a-fA-F-]{36})/);
  return m?.[1] ?? null;
}

/**
 * Quando o vendedor cola o link da Plataforma na venda ou no card,
 * vincula automaticamente sale_id / kanban_card_id na pasta correspondente.
 * Só preenche campos ainda nulos (não sobrescreve vínculos existentes).
 */
export async function autoLinkFolderFromUrl(
  url: string | null | undefined,
  opts: { saleId?: string | null; kanbanCardId?: string | null },
) {
  const folderId = extractFolderIdFromLink(url);
  if (!folderId) return null;
  const { data: folder } = await supabase
    .from("project_folders" as any)
    .select("id, sale_id, kanban_card_id")
    .eq("id", folderId)
    .maybeSingle();
  if (!folder) return null;
  const patch: Record<string, string> = {};
  if (opts.saleId && !(folder as any).sale_id) patch.sale_id = opts.saleId;
  if (opts.kanbanCardId && !(folder as any).kanban_card_id) patch.kanban_card_id = opts.kanbanCardId;
  if (Object.keys(patch).length === 0) return folder;
  await supabase.from("project_folders" as any).update(patch).eq("id", folderId);
  return { ...(folder as any), ...patch };
}

/**
 * Reprocessa os links já salvos em vendas e cards para recuperar vínculos de
 * pastas antigas. Não sobrescreve vínculos existentes.
 */
export async function synchronizeProjectFolderLinks() {
  const [{ data: sales, error: salesError }, { data: cards, error: cardsError }] =
    await Promise.all([
      supabase
        .from("sales")
        .select("id,platform_link,google_drive_link,trello_link"),
      supabase
        .from("service_orders")
        .select("id,sale_id,platform_link,google_drive_link,trello_link"),
    ]);

  if (salesError) throw salesError;
  if (cardsError) throw cardsError;

  const matches = new Map<string, { saleId?: string | null; kanbanCardId?: string | null }>();

  for (const sale of sales ?? []) {
    for (const link of [sale.platform_link, sale.google_drive_link, sale.trello_link]) {
      const folderId = extractFolderIdFromLink(link);
      if (folderId) matches.set(folderId, { saleId: sale.id });
    }
  }

  for (const card of cards ?? []) {
    for (const link of [card.platform_link, card.google_drive_link, card.trello_link]) {
      const folderId = extractFolderIdFromLink(link);
      if (!folderId) continue;
      const current = matches.get(folderId);
      matches.set(folderId, {
        saleId: card.sale_id ?? current?.saleId,
        kanbanCardId: card.id,
      });
    }
  }

  const results = await Promise.all(
    Array.from(matches.entries()).map(([folderId, link]) =>
      autoLinkFolderFromUrl(`/pastas-arquivos/${folderId}`, link),
    ),
  );

  return results.filter(Boolean).length;
}
