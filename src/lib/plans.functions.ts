import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(ctx: any) {
  const { data, error } = await ctx.supabase.rpc("has_role", {
    _user_id: ctx.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden");
}

export const upsertPlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      id?: string;
      slug: string;
      name: string;
      description?: string | null;
      price_cents: number;
      billing_period: "monthly" | "yearly";
      features: string[];
      limits: Record<string, number>;
      is_active: boolean;
      is_highlight: boolean;
      sort_order: number;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const payload = {
      slug: data.slug,
      name: data.name,
      description: data.description ?? null,
      price_cents: data.price_cents,
      billing_period: data.billing_period,
      features: data.features,
      limits: data.limits,
      is_active: data.is_active,
      is_highlight: data.is_highlight,
      sort_order: data.sort_order,
    };
    if (data.id) {
      const { error } = await context.supabase
        .from("plans" as any)
        .update(payload)
        .eq("id", data.id);
      if (error) throw error;
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await context.supabase
      .from("plans" as any)
      .insert(payload)
      .select("id")
      .single();
    if (error) throw error;
    return { ok: true, id: (row as any).id };
  });

export const deletePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("plans" as any)
      .delete()
      .eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

export const activatePlan = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { plan_id: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const now = new Date();
    const end = new Date(now);
    end.setMonth(end.getMonth() + 1);
    const { error } = await context.supabase
      .from("subscription" as any)
      .update({
        plan_id: data.plan_id,
        status: "active",
        started_at: now.toISOString(),
        current_period_end: end.toISOString(),
      })
      .eq("id", true);
    if (error) throw error;
    return { ok: true };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("subscription" as any)
      .update({ status: "canceled" })
      .eq("id", true);
    if (error) throw error;
    return { ok: true };
  });