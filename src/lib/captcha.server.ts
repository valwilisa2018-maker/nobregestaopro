import { createClient } from "@supabase/supabase-js";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@/integrations/supabase/types";

const TTL_MS = 5 * 60 * 1000;

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

export function issueCaptchaChallenge() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  const exp = Date.now() + TTL_MS;
  return { a, b, token: makeToken(a, b, exp), expiresAt: exp };
}

export function verifyCaptchaToken(token: string, answer: number): boolean {
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

function anonClient() {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

export async function signInWithPassword(email: string, password: string) {
  const supabase = anonClient();
  return supabase.auth.signInWithPassword({ email, password });
}

export async function signUpWithPassword(
  email: string,
  password: string,
  emailRedirectTo?: string,
  metadata?: Record<string, unknown>,
) {
  const supabase = anonClient();
  return supabase.auth.signUp({
    email,
    password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      ...(metadata ? { data: metadata } : {}),
    },
  });
}