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

async function findUserIdByEmail(email: string): Promise<{ userId: string; email: string; fullName: string | null }> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const normalized = email.trim().toLowerCase();
  // Paginate through auth users to find by email (Supabase admin has no direct getByEmail)
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const found = data.users.find(u => (u.email ?? "").toLowerCase() === normalized);
    if (found) {
      const { data: prof } = await supabaseAdmin.from("profiles").select("full_name").eq("id", found.id).maybeSingle();
      return { userId: found.id, email: found.email ?? normalized, fullName: prof?.full_name ?? null };
    }
    if (data.users.length < 200) break;
  }
  throw new Error("Usuário não encontrado para este e-mail");
}

export const masterLookupByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase, context.userId);
    return findUserIdByEmail(data.email);
  });

export const masterActivateByEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { email: string; planId?: string | null; days?: number; tokens?: number; reason?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertMaster(context.supabase, context.userId);
    const target = await findUserIdByEmail(data.email);
    const results: { plan?: boolean; tokens?: number } = {};
    if (data.planId) {
      const days = Math.max(1, Number(data.days ?? 30));
      const expires = new Date(Date.now() + days * 86400000).toISOString();
      const { error } = await context.supabase.rpc("master_activate_account", {
        _user_id: target.userId, _plan_id: data.planId, _expires_at: expires,
      });
      if (error) throw new Error(error.message);
      results.plan = true;
    }
    if (data.tokens && data.tokens > 0) {
      const { error } = await context.supabase.rpc("master_grant_credits", {
        _user_id: target.userId, _tokens: data.tokens, _reason: data.reason ?? "ativação manual por e-mail",
      });
      if (error) throw new Error(error.message);
      results.tokens = data.tokens;
    }
    return { ...target, ...results };
  });