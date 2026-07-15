import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertSuperAdmin(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "super_admin",
  });
  if (error || !data) throw new Error("Forbidden: super_admin only");
}

export const upsertMasterAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      name: string;
      contact_email?: string | null;
      contact_phone?: string | null;
      document?: string | null;
      plan_id?: string | null;
      custom_price_cents?: number | null;
      status: "trial" | "active" | "past_due" | "suspended" | "canceled";
      billing_day: number;
      next_billing_at?: string | null;
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const payload: Record<string, any> = {
      name: data.name.trim(),
      contact_email: data.contact_email ?? null,
      contact_phone: data.contact_phone ?? null,
      document: data.document ?? null,
      plan_id: data.plan_id ?? null,
      custom_price_cents: data.custom_price_cents ?? null,
      status: data.status,
      billing_day: data.billing_day,
      next_billing_at: data.next_billing_at ?? null,
      notes: data.notes ?? null,
    };
    if (data.status === "active") payload.activated_at = new Date().toISOString();
    if (data.id) {
      const { error } = await context.supabase
        .from("master_accounts" as any).update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("master_accounts" as any).insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const deleteMasterAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("master_accounts" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const changeAccountStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: {
    id: string;
    status: "trial" | "active" | "past_due" | "suspended" | "canceled";
  }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const payload: any = { status: data.status };
    if (data.status === "active") payload.activated_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("master_accounts" as any).update(payload).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertAccountInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      account_id: string;
      amount_cents: number;
      reference_month: string;
      due_date: string;
      status: "pending" | "paid" | "overdue" | "canceled" | "refunded";
      payment_method?: string | null;
      paid_at?: string | null;
      notes?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const payload: Record<string, any> = {
      account_id: data.account_id,
      amount_cents: data.amount_cents,
      reference_month: data.reference_month,
      due_date: data.due_date,
      status: data.status,
      payment_method: data.payment_method ?? null,
      paid_at: data.paid_at ?? (data.status === "paid" ? new Date().toISOString() : null),
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("master_account_invoices" as any).update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("master_account_invoices" as any).insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; payment_method?: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("master_account_invoices" as any)
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: data.payment_method ?? "manual",
      })
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const deleteAccountInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { error } = await context.supabase
      .from("master_account_invoices" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const generateMonthlyInvoices = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { reference_month: string }) => d) // 'YYYY-MM-01'
  .handler(async ({ data, context }) => {
    await assertSuperAdmin(context);
    const { data: accounts, error } = await context.supabase
      .from("master_accounts" as any)
      .select("id, billing_day, custom_price_cents, status, plan_id, plans(price_cents)")
      .in("status", ["active", "trial", "past_due"]);
    if (error) throw error;

    let created = 0;
    const ref = new Date(data.reference_month + "T00:00:00Z");
    for (const a of (accounts ?? []) as any[]) {
      const amount = a.custom_price_cents ?? a.plans?.price_cents ?? 0;
      if (!amount) continue;

      const { data: existing } = await context.supabase
        .from("master_account_invoices" as any)
        .select("id")
        .eq("account_id", a.id)
        .eq("reference_month", data.reference_month)
        .maybeSingle();
      if (existing) continue;

      const due = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), a.billing_day));
      const { error: insErr } = await context.supabase
        .from("master_account_invoices" as any)
        .insert({
          account_id: a.id,
          amount_cents: amount,
          reference_month: data.reference_month,
          due_date: due.toISOString().slice(0, 10),
          status: "pending",
        });
      if (!insErr) created++;
    }
    return { ok: true, created };
  });