import { createServerFn } from "@tanstack/react-start";

async function getAdmin() {
  const { requireMasterAdmin } = await import("./master-auth.server");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await requireMasterAdmin();
  return supabaseAdmin;
}

export const upsertMasterAccount = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    const db = await getAdmin();
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
      const { error } = await db.from("master_accounts" as any).update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await db.from("master_accounts" as any).insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const deleteMasterAccount = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { error } = await db.from("master_accounts" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const changeAccountStatus = createServerFn({ method: "POST" })
  .inputValidator((d: {
    id: string;
    status: "trial" | "active" | "past_due" | "suspended" | "canceled";
  }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const payload: any = { status: data.status };
    if (data.status === "active") payload.activated_at = new Date().toISOString();
    const { error } = await db.from("master_accounts" as any).update(payload).eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const upsertAccountInvoice = createServerFn({ method: "POST" })
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
  .handler(async ({ data }) => {
    const db = await getAdmin();
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
      const { error } = await db.from("master_account_invoices" as any).update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await db.from("master_account_invoices" as any).insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const markInvoicePaid = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string; payment_method?: string }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { error } = await db
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
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { error } = await db.from("master_account_invoices" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const generateMonthlyInvoices = createServerFn({ method: "POST" })
  .inputValidator((d: { reference_month: string }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { data: accounts, error } = await db
      .from("master_accounts" as any)
      .select("id, billing_day, custom_price_cents, status, plan_id, plans(price_cents)")
      .in("status", ["active", "trial", "past_due"]);
    if (error) throw error;

    let created = 0;
    const ref = new Date(data.reference_month + "T00:00:00Z");
    for (const a of (accounts ?? []) as any[]) {
      const amount = a.custom_price_cents ?? a.plans?.price_cents ?? 0;
      if (!amount) continue;

      const { data: existing } = await db
        .from("master_account_invoices" as any)
        .select("id")
        .eq("account_id", a.id)
        .eq("reference_month", data.reference_month)
        .maybeSingle();
      if (existing) continue;

      const due = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), a.billing_day));
      const { error: insErr } = await db
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

// ---------------- Plans (master-scoped, bypass RLS) ----------------

export const listPlansAll = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getAdmin();
  const { data, error } = await db
    .from("plans" as any)
    .select("*")
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
});

export const upsertMasterPlan = createServerFn({ method: "POST" })
  .inputValidator(
    (d: {
      id?: string;
      slug: string;
      name: string;
      description?: string | null;
      price_cents: number;
      billing_period: "monthly" | "yearly";
      features: string[];
      is_active: boolean;
      is_highlight: boolean;
      sort_order: number;
    }) => d,
  )
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const payload: Record<string, any> = {
      slug: data.slug.trim(),
      name: data.name.trim(),
      description: data.description ?? null,
      price_cents: data.price_cents,
      billing_period: data.billing_period,
      features: data.features ?? [],
      is_active: data.is_active,
      is_highlight: data.is_highlight,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await db.from("plans" as any).update(payload).eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await db.from("plans" as any).insert(payload).select("id").single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const deleteMasterPlan = createServerFn({ method: "POST" })
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data }) => {
    const db = await getAdmin();
    const { error } = await db.from("plans" as any).delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

// ---------------- Platform usage aggregates (global) ----------------

export const getPlatformStats = createServerFn({ method: "GET" }).handler(async () => {
  const db = await getAdmin();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const count = async (table: string, filter?: (q: any) => any) => {
    let q = db.from(table as any).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    const { count: c } = await q;
    return c ?? 0;
  };

  const [
    salesTotal,
    salesMonth,
    customersTotal,
    producersTotal,
    sellersTotal,
    profilesTotal,
    ordersOpen,
    ordersDelivered,
  ] = await Promise.all([
    count("sales"),
    count("sales", (q) => q.gte("created_at", monthStart)),
    count("customers"),
    count("producers"),
    count("sellers"),
    count("profiles"),
    count("service_orders", (q) => q.is("delivered_at", null)),
    count("service_orders", (q) => q.not("delivered_at", "is", null)),
  ]);

  const { data: revRows } = await db
    .from("sales" as any)
    .select("total_amount, paid_amount, sale_date, created_at");

  let revenueTotal = 0;
  let revenueMonth = 0;
  let paidTotal = 0;
  const ms = new Date(monthStart).getTime();
  for (const r of (revRows ?? []) as any[]) {
    const t = Number(r.total_amount ?? 0);
    const p = Number(r.paid_amount ?? 0);
    revenueTotal += t;
    paidTotal += p;
    const when = new Date(r.created_at ?? r.sale_date ?? 0).getTime();
    if (when >= ms) revenueMonth += t;
  }

  return {
    sales: { total: salesTotal, month: salesMonth },
    revenue: { total: revenueTotal, month: revenueMonth, paid: paidTotal },
    customers: customersTotal,
    producers: producersTotal,
    sellers: sellersTotal,
    users: profilesTotal,
    orders: { open: ordersOpen, delivered: ordersDelivered },
  };
});