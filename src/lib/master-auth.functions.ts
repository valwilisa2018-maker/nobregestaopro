import { createServerFn } from "@tanstack/react-start";

export const masterLogin = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string }) => {
    if (!d?.email || !d?.password) throw new Error("Email e senha são obrigatórios");
    return { email: String(d.email).trim(), password: String(d.password) };
  })
  .handler(async ({ data }) => {
    const { getMasterSession } = await import("./master-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("master_verify_login" as any, {
      _email: data.email,
      _password: data.password,
    });
    if (error) throw new Error("Falha ao validar credenciais");
    const row = Array.isArray(rows) ? rows[0] : rows;
    if (!row?.id) return { ok: false as const };

    await supabaseAdmin
      .from("master_admins" as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq("id", row.id);

    const session = await getMasterSession();
    await session.update({ adminId: row.id, email: row.email, name: row.name });
    return { ok: true as const, name: row.name, email: row.email };
  });

export const masterLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { getMasterSession } = await import("./master-auth.server");
  const session = await getMasterSession();
  await session.clear();
  return { ok: true as const };
});

export const masterMe = createServerFn({ method: "GET" }).handler(async () => {
  const { getMasterSession } = await import("./master-auth.server");
  const session = await getMasterSession();
  if (!session.data.adminId) return { authenticated: false as const };
  return {
    authenticated: true as const,
    adminId: session.data.adminId,
    email: session.data.email ?? "",
    name: session.data.name ?? "Admin Master",
  };
});

export const masterChangePassword = createServerFn({ method: "POST" })
  .inputValidator((d: { currentPassword: string; newPassword: string }) => {
    if (!d?.currentPassword || !d?.newPassword) throw new Error("Preencha os campos");
    if (d.newPassword.length < 6) throw new Error("A nova senha deve ter pelo menos 6 caracteres");
    return d;
  })
  .handler(async ({ data }) => {
    const { requireMasterAdmin } = await import("./master-auth.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = await requireMasterAdmin();

    // Verify current password
    const { data: rec } = await supabaseAdmin
      .from("master_admins" as any)
      .select("email")
      .eq("id", admin.adminId)
      .maybeSingle();
    if (!rec) throw new Error("Admin não encontrado");

    const { data: verified } = await supabaseAdmin.rpc("master_verify_login" as any, {
      _email: (rec as any).email,
      _password: data.currentPassword,
    });
    const ok = Array.isArray(verified) ? verified.length > 0 : !!verified;
    if (!ok) throw new Error("Senha atual incorreta");

    const { error } = await supabaseAdmin.rpc("master_change_password" as any, {
      _admin_id: admin.adminId,
      _new_password: data.newPassword,
    });
    if (error) throw new Error("Não foi possível trocar a senha");
    return { ok: true as const };
  });

// ---------- Read helpers (used by /master page) ----------

export const listMasterAccounts = createServerFn({ method: "GET" }).handler(async () => {
  const { requireMasterAdmin } = await import("./master-auth.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await requireMasterAdmin();
  const { data, error } = await supabaseAdmin
    .from("master_accounts" as any)
    .select("*, plans(name, price_cents)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
});

export const listMasterInvoices = createServerFn({ method: "GET" }).handler(async () => {
  const { requireMasterAdmin } = await import("./master-auth.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await requireMasterAdmin();
  const { data, error } = await supabaseAdmin
    .from("master_account_invoices" as any)
    .select("*, master_accounts(name)")
    .order("due_date", { ascending: false });
  if (error) throw error;
  return data ?? [];
});

export const listPlansMin = createServerFn({ method: "GET" }).handler(async () => {
  const { requireMasterAdmin } = await import("./master-auth.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await requireMasterAdmin();
  const { data, error } = await supabaseAdmin
    .from("plans" as any)
    .select("id, name, price_cents")
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
});