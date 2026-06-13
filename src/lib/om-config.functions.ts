import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const omSaveScoring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { evento: "pronto" | "alteracao" | "entregue" | "distribuicao_edicao"; multiplicador: number }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_scoring" as any)
      .update({ multiplicador: data.multiplicador })
      .eq("evento", data.evento);
    if (error) throw error;
    return { ok: true };
  });

export const omUpsertListMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { list_id: string; list_name: string; evento: string }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_trello_list_map" as any)
      .upsert(
        { list_id: data.list_id, list_name: data.list_name, evento: data.evento },
        { onConflict: "list_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const omDeleteListMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_trello_list_map" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const omUpsertMemberMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: { trello_member_id: string; trello_username?: string; producer_id: string }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_trello_member_map" as any)
      .upsert(
        {
          trello_member_id: data.trello_member_id,
          trello_username: data.trello_username ?? null,
          producer_id: data.producer_id,
        },
        { onConflict: "trello_member_id" },
      );
    if (error) throw error;
    return { ok: true };
  });

export const omDeleteMemberMap = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_trello_member_map" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const omSaveWebhookSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { secret: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("om_settings" as any)
      .update({ trello_webhook_secret: data.secret })
      .eq("id", true);
    if (error) throw error;
    return { ok: true };
  });