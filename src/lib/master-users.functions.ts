import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertMaster(supabase: any, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "master" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("forbidden");
}

export const masterDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase, context.userId);
    if (data.userId === context.userId) throw new Error("cannot_delete_self");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const masterGenerateAccessLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: u, error: uErr } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (uErr || !u?.user?.email) throw new Error(uErr?.message ?? "user_not_found");
    const { data: link, error } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: u.user.email,
    });
    if (error) throw new Error(error.message);
    return { email: u.user.email, action_link: link.properties?.action_link ?? null };
  });

export const masterSetBlocked = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { userId: string; blocked: boolean; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase, context.userId);
    if (data.blocked) {
      const { error } = await context.supabase.rpc("master_suspend_account", {
        _user_id: data.userId, _reason: data.reason ?? "bloqueado pelo Master",
      });
      if (error) throw new Error(error.message);
    } else {
      const { error } = await context.supabase.rpc("master_reactivate_account", { _user_id: data.userId });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });