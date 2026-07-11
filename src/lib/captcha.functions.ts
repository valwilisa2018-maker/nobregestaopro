import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";

const TTL_MS = 5 * 60 * 1000; // 5 minutes

function secret() {
  const s = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!s) throw new Error("captcha secret unavailable");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function makeToken(a: number, b: number, exp: number) {
  const payload = `${a}:${b}:${exp}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

function verifyToken(token: string, answer: number): boolean {
  const [p, sig] = token.split(".");
  if (!p || !sig) return false;
  const payload = Buffer.from(p, "base64url").toString("utf8");
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  const [aStr, bStr, expStr] = payload.split(":");
  const exp = Number(expStr);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  return Number(aStr) + Number(bStr) === answer;
}

export const issueCaptcha = createServerFn({ method: "GET" }).handler(async () => {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const exp = Date.now() + TTL_MS;
  return { a, b, token: makeToken(a, b, exp), expiresAt: exp };
});

function anonClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export const signInWithCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; token: string; answer: number }) => d)
  .handler(async ({ data }) => {
    if (!verifyToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    const supabase = anonClient();
    const { data: res, error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });
    if (error || !res.session) return { ok: false as const, error: error?.message ?? "Falha no login" };
    return {
      ok: true as const,
      session: { access_token: res.session.access_token, refresh_token: res.session.refresh_token },
    };
  });

export const signUpWithCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; token: string; answer: number; emailRedirectTo?: string }) => d)
  .handler(async ({ data }) => {
    if (!verifyToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    const supabase = anonClient();
    const { data: res, error } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: data.emailRedirectTo ? { emailRedirectTo: data.emailRedirectTo } : undefined,
    });
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      session: res.session
        ? { access_token: res.session.access_token, refresh_token: res.session.refresh_token }
        : null,
    };
  });