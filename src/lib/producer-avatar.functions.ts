import { createServerFn } from "@tanstack/react-start";
import { randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export const uploadProducerAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { producerId: string; contentType: string; base64: string }) => data)
  .handler(async ({ data, context }) => {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        data.producerId,
      )
    ) {
      throw new Error("Produtor inválido.");
    }
    const extension = allowedTypes.get(data.contentType);
    if (!extension) throw new Error("Formato não permitido. Use JPG, PNG, WEBP ou GIF.");
    if (
      !data.base64 ||
      data.base64.length > 7_100_000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(data.base64)
    ) {
      throw new Error("Arquivo de imagem inválido ou muito grande.");
    }

    const [{ data: isAdmin }, { data: canEdit }] = await Promise.all([
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
      context.supabase.rpc("has_permission", {
        _user_id: context.userId,
        _module: "producers",
        _action: "edit",
      }),
    ]);
    if (!isAdmin && !canEdit)
      throw new Response("Sem permissão para alterar produtores.", { status: 403 });

    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.length === 0 || bytes.length > 5 * 1024 * 1024) {
      throw new Error("A foto deve ter no máximo 5 MB.");
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: producer, error: producerError } = await supabaseAdmin
      .from("producers")
      .select("id")
      .eq("id", data.producerId)
      .maybeSingle();
    if (producerError || !producer) throw new Error("Produtor não encontrado.");

    const path = `${data.producerId}/${Date.now()}-${randomBytes(6).toString("hex")}.${extension}`;
    const { error: uploadError } = await supabaseAdmin.storage
      .from("producer-avatars")
      .upload(path, bytes, { contentType: data.contentType, cacheControl: "3600", upsert: false });
    if (uploadError) throw new Error(`Não foi possível gravar a foto: ${uploadError.message}`);

    const { error: updateError } = await supabaseAdmin
      .from("producers")
      .update({ avatar_url: path })
      .eq("id", data.producerId);
    if (updateError) {
      await supabaseAdmin.storage.from("producer-avatars").remove([path]);
      throw new Error(`Não foi possível vincular a foto: ${updateError.message}`);
    }

    return { path };
  });
