// Credit wallet helpers: pre-check balance before an AI call and consume
// tokens after the call completes. Uses existing SQL functions
// ensure_credit_wallet + consume_ai_tokens (see supabase migrations).
import type { SupabaseClient } from "@supabase/supabase-js";

export class InsufficientCreditsError extends Error {
  status = 402;
  constructor(public remaining = 0) {
    super("insufficient_credits");
    this.name = "InsufficientCreditsError";
  }
}

type Wallet = { plan_tokens_remaining: number; extra_tokens_remaining: number };

export async function checkAiBalance(supabase: SupabaseClient, userId: string): Promise<{ ok: boolean; remaining: number }> {
  // Ensure wallet exists / cycle renewal.
  await supabase.rpc("ensure_credit_wallet" as never, { _user_id: userId } as never);
  const { data } = await supabase
    .from("credit_wallets")
    .select("plan_tokens_remaining, extra_tokens_remaining")
    .eq("user_id", userId)
    .maybeSingle<Wallet>();
  const remaining = (data?.plan_tokens_remaining ?? 0) + (data?.extra_tokens_remaining ?? 0);
  return { ok: remaining > 0, remaining };
}

export type ConsumeResult = { allowed: boolean; remaining?: number; reason?: string };

export async function consumeAiTokens(
  supabase: SupabaseClient,
  params: { userId: string; agentId: string | null; model: string; inputTokens: number; outputTokens: number; costCents?: number },
): Promise<ConsumeResult> {
  const { data, error } = await supabase.rpc("consume_ai_tokens" as never, {
    _user_id: params.userId,
    _agent_id: params.agentId,
    _model: params.model,
    _input_tokens: params.inputTokens,
    _output_tokens: params.outputTokens,
    _cost_cents: params.costCents ?? 0,
  } as never);
  if (error) throw error;
  const r = (data ?? { allowed: false }) as ConsumeResult;
  if (!r.allowed) throw new InsufficientCreditsError(Number(r.remaining ?? 0));
  return r;
}