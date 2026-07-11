import { createServerFn } from "@tanstack/react-start";
import { issueCaptchaChallenge, sendPasswordResetWithBrevo, signInWithPassword, signUpWithPassword, verifyCaptchaToken } from "./captcha.server";

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
  .inputValidator((d: { email: string; password: string; token: string; answer: number; emailRedirectTo?: string; fullName: string; phone: string }) => {
    const fullName = (d.fullName ?? "").trim().replace(/\s+/g, " ");
    if (fullName.length < 3 || fullName.length > 120 || !fullName.includes(" ")) {
      throw new Error("Informe seu nome completo (mínimo 3 caracteres e sobrenome).");
    }
    let digits = (d.phone ?? "").replace(/\D/g, "").replace(/^0+/, "");
    // Assume Brasil quando vier sem código do país (10 ou 11 dígitos = DDD + número)
    if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
    // Formato BR esperado: 55 + DDD(2) + 8 ou 9 dígitos = 12 ou 13
    if (digits.startsWith("55")) {
      const rest = digits.slice(2);
      if (rest.length !== 10 && rest.length !== 11) {
        throw new Error("WhatsApp inválido. Informe DDD + número (ex.: 11999999999).");
      }
      const ddd = parseInt(rest.slice(0, 2), 10);
      if (!(ddd >= 11 && ddd <= 99)) {
        throw new Error("DDD inválido. Verifique o número informado.");
      }
      // Celular (11 dígitos) precisa começar com 9
      if (rest.length === 11 && rest[2] !== "9") {
        throw new Error("Celular inválido. O número deve começar com 9 após o DDD.");
      }
    } else if (digits.length < 8 || digits.length > 15) {
      throw new Error("WhatsApp inválido. Informe o número com código do país e DDD.");
    }
    const phone = "+" + digits;
    return { ...d, fullName, phone };
  })
  .handler(async ({ data }) => {
    if (!verifyCaptchaToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    const { data: res, error } = await signUpWithPassword(data.email, data.password, data.emailRedirectTo, {
      full_name: data.fullName,
      phone: data.phone,
    });
    if (error) return { ok: false as const, error: error.message };
    return {
      ok: true as const,
      session: null,
    };
  });

export const resetPasswordWithCaptcha = createServerFn({ method: "POST" })
  .inputValidator((d: { email: string; token: string; answer: number; redirectTo: string }) => d)
  .handler(async ({ data }) => {
    if (!verifyCaptchaToken(data.token, Number(data.answer))) {
      return { ok: false as const, error: "Verificação incorreta. Tente novamente." };
    }
    return sendPasswordResetWithBrevo(data.email, data.redirectTo);
  });