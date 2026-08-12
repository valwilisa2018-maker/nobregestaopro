/* eslint-disable @typescript-eslint/no-explicit-any */
import { createServerFn } from "@tanstack/react-start";
import { createHash, randomBytes } from "node:crypto";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MENU_MODULES, normalizePermissions, type PermissionMap } from "@/lib/access-control";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const cleanText = (value: unknown, max: number) =>
  String(value ?? "")
    .trim()
    .slice(0, max);
const cleanEmail = (value: unknown) => cleanText(value, 320).toLowerCase();
const validEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

async function assertAdmin(context: any) {
  const [{ data: active, error: activeError }, { data: admin, error: adminError }] =
    await Promise.all([
      context.supabase.rpc("is_active_user", { _user_id: context.userId }),
      context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" }),
    ]);
  if (activeError || !active) throw new Response("Usuário inativo", { status: 403 });
  if (adminError || !admin) throw new Response("Acesso não autorizado", { status: 403 });
}

async function audit(
  admin: any,
  action: string,
  by: string | null,
  details: Record<string, unknown>,
) {
  const { error } = await admin.from("audit_logs").insert({ action, performed_by: by, details });
  if (error) console.error("Falha ao gravar auditoria de acesso", error);
}

function permissionRows(userId: string, permissions: unknown, updatedBy: string | null) {
  const normalized = normalizePermissions(permissions);
  return MENU_MODULES.map(({ key }) => ({
    user_id: userId,
    module: key,
    can_view: normalized[key].view,
    can_create: normalized[key].create,
    can_edit: normalized[key].edit,
    can_delete: normalized[key].delete,
    updated_by: updatedBy,
  }));
}

export const getMyAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db: any = context.supabase;
    const [
      { data: profile, error: profileError },
      { data: roles, error: roleError },
      { data: permissions, error: permissionError },
    ] = await Promise.all([
      db
        .from("profiles")
        .select("id,full_name,email,job_title,status,managed_access")
        .eq("id", context.userId)
        .single(),
      db.from("user_roles").select("role").eq("user_id", context.userId),
      db
        .from("user_permissions")
        .select("module,can_view,can_create,can_edit,can_delete")
        .eq("user_id", context.userId),
    ]);
    if (profileError || roleError || permissionError)
      throw new Error("Não foi possível carregar as permissões.");
    if (!profile || (profile as any).status !== "active")
      throw new Response("Usuário inativo", { status: 403 });
    return {
      profile,
      roles: (roles ?? []).map((row: any) => row.role),
      permissions: permissions ?? [],
    };
  });

export const listAccessAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const results = await Promise.all([
      supabaseAdmin
        .from("profiles")
        .select("id,full_name,email,job_title,status,managed_access,created_at")
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("user_roles").select("user_id,role"),
      supabaseAdmin
        .from("user_permissions")
        .select("user_id,module,can_view,can_create,can_edit,can_delete"),
      supabaseAdmin
        .from("invitations")
        .select("id,email,name,job_title,created_at,expires_at,status,permissions")
        .order("created_at", { ascending: false }),
    ]);
    const failed = results.find((result) => result.error);
    if (failed?.error) throw failed.error;
    return {
      profiles: results[0].data ?? [],
      roles: results[1].data ?? [],
      permissions: results[2].data ?? [],
      invitations: results[3].data ?? [],
    };
  });

export const createInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { email: string; name: string; jobTitle?: string; permissions?: PermissionMap }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const email = cleanEmail(data.email);
    const name = cleanText(data.name, 160);
    const jobTitle = cleanText(data.jobTitle, 120) || null;
    if (!name || !validEmail(email)) throw new Error("Nome e e-mail válido são obrigatórios.");
    const [{ data: existing }, { data: pending }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id").ilike("email", email).maybeSingle(),
      supabaseAdmin
        .from("invitations")
        .select("id")
        .eq("email", email)
        .eq("status", "pending")
        .maybeSingle(),
    ]);
    if (existing) throw new Error("Este e-mail já possui acesso à plataforma.");
    if (pending) throw new Error("Já existe um convite pendente para este e-mail.");
    const token = randomBytes(32).toString("base64url");
    const { data: invitation, error } = await supabaseAdmin
      .from("invitations")
      .insert({
        email,
        name,
        job_title: jobTitle,
        token_hash: hashToken(token),
        created_by: context.userId,
        permissions: normalizePermissions(data.permissions),
        expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
      })
      .select("id,expires_at")
      .single();
    if (error) throw error;
    await audit(supabaseAdmin, "invitation_created", context.userId, {
      invitation_id: invitation.id,
      email,
    });
    return { id: invitation.id, token, expiresAt: invitation.expires_at };
  });

export const inspectInvitation = createServerFn({ method: "GET" })
  .inputValidator((data: { token: string }) => data)
  .handler(async ({ data }) => {
    const token = cleanText(data.token, 200);
    if (!token) return { valid: false as const, reason: "Convite inválido." };
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const { data: row, error } = await supabaseAdmin
      .from("invitations")
      .select("id,email,name,job_title,status,expires_at")
      .eq("token_hash", hashToken(token))
      .maybeSingle();
    if (error || !row) return { valid: false as const, reason: "Convite inválido." };
    if ((row as any).status !== "pending")
      return { valid: false as const, reason: "Este convite não está mais disponível." };
    if (new Date((row as any).expires_at).getTime() <= Date.now()) {
      await supabaseAdmin
        .from("invitations")
        .update({ status: "expired" })
        .eq("id", (row as any).id)
        .eq("status", "pending");
      return { valid: false as const, reason: "Este convite expirou." };
    }
    return { valid: true as const, invitation: row };
  });

export const acceptInvitation = createServerFn({ method: "POST" })
  .inputValidator((data: { token: string; password: string }) => data)
  .handler(async ({ data }) => {
    const password = String(data.password ?? "");
    if (password.length < 8 || password.length > 128)
      throw new Error("A senha deve ter entre 8 e 128 caracteres.");
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const { data: invitation } = await supabaseAdmin
      .from("invitations")
      .select("*")
      .eq("token_hash", hashToken(cleanText(data.token, 200)))
      .maybeSingle();
    const inv = invitation as any;
    if (!inv || inv.status !== "pending" || new Date(inv.expires_at).getTime() <= Date.now())
      throw new Error("Convite inválido, expirado ou já utilizado.");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: inv.name },
    });
    if (error || !created.user)
      throw new Error(error?.message ?? "Não foi possível criar a conta.");
    const userId = created.user.id;
    try {
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          full_name: inv.name,
          job_title: inv.job_title,
          status: "active",
          managed_access: true,
        })
        .eq("id", userId);
      if (profileError) throw profileError;
      const { error: permissionError } = await supabaseAdmin
        .from("user_permissions")
        .upsert(permissionRows(userId, inv.permissions, inv.created_by));
      if (permissionError) throw permissionError;
      const { data: claimed, error: invitationError } = await supabaseAdmin
        .from("invitations")
        .update({ status: "accepted", accepted_by: userId, accepted_at: new Date().toISOString() })
        .eq("id", inv.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      if (invitationError || !claimed) throw new Error("Este convite já foi utilizado.");
      await audit(supabaseAdmin, "invitation_accepted", userId, { invitation_id: inv.id });
      return { ok: true, email: inv.email };
    } catch (error) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      throw error;
    }
  });

export const updateUserAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { userId: string; jobTitle?: string; permissions?: PermissionMap }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId)
      throw new Error("O administrador não pode alterar o próprio acesso aqui.");
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const before = await supabaseAdmin
      .from("user_permissions")
      .select("*")
      .eq("user_id", data.userId);
    const rows = permissionRows(data.userId, data.permissions, context.userId);
    const { error: permissionError } = await supabaseAdmin.from("user_permissions").upsert(rows);
    if (permissionError) throw permissionError;
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ managed_access: true, job_title: cleanText(data.jobTitle, 120) || null })
      .eq("id", data.userId);
    if (profileError) throw profileError;
    await audit(supabaseAdmin, "user_permissions_updated", context.userId, {
      user_id: data.userId,
      before: before.data,
      after: rows,
    });
    return { ok: true };
  });

export const setUserStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { userId: string; status: "active" | "inactive" }) => data)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId)
      throw new Error("O administrador não pode desativar a própria conta.");
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ status: data.status })
      .eq("id", data.userId);
    if (error) throw error;
    if (data.status === "inactive") await supabaseAdmin.auth.admin.signOut(data.userId, "global");
    await audit(
      supabaseAdmin,
      data.status === "active" ? "user_reactivated" : "user_deactivated",
      context.userId,
      { user_id: data.userId },
    );
    return { ok: true };
  });

export const updateInvitation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: {
      id: string;
      action: "revoke" | "permissions" | "renew";
      permissions?: PermissionMap;
    }) => data,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin: rawAdmin } = await import("@/integrations/supabase/client.server");
    const supabaseAdmin: any = rawAdmin;
    const token = data.action === "renew" ? randomBytes(32).toString("base64url") : null;
    const patch =
      data.action === "revoke"
        ? { status: "revoked", revoked_at: new Date().toISOString() }
        : data.action === "renew"
          ? {
              token_hash: hashToken(token!),
              expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
            }
          : { permissions: normalizePermissions(data.permissions) };
    const { data: changed, error } = await supabaseAdmin
      .from("invitations")
      .update(patch)
      .eq("id", data.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (error) throw error;
    if (!changed) throw new Error("O convite não está mais pendente.");
    await audit(supabaseAdmin, `invitation_${data.action}`, context.userId, {
      invitation_id: data.id,
    });
    return { ok: true, token };
  });
