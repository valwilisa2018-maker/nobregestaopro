import { createServerFn } from "@tanstack/react-start";
import { issueCaptchaChallenge, signInWithPassword, signUpWithPassword, verifyCaptchaToken } from "./captcha.server";

export const issueCaptcha = createServerFn({ method: "GET" }).handler(async () => {
  return issueCaptchaChallenge();
});

export const signInWithCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; token: string; answer: number }) => d)
  .handler(async ({ data }) => {
    if (!verifyCaptchaToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    const { data: res, error } = await signInWithPassword(data.email, data.password);
    if (error || !res.session) return { ok: false as const, error: error?.message ?? "Falha no login" };
    return {
      ok: true as const,
      session: { access_token: res.session.access_token, refresh_token: res.session.refresh_token },
    };
  });

export const signUpWithCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; password: string; token: string; answer: number; emailRedirectTo?: string }) => d)
  .handler(async ({ data }) => {
    if (!verifyCaptchaToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    const { data: res, error } = await signUpWithPassword(data.email, data.password, data.emailRedirectTo);
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      session: res.session
        ? { access_token: res.session.access_token, refresh_token: res.session.refresh_token }
        : null,
    };
  });