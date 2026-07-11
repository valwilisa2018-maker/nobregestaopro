import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BREVO_API = "https://api.brevo.com/v3/smtp/email";
const BREVO_SENDERS_API = "https://api.brevo.com/v3/senders";

export type EmailSettings = {
  sender_email: string | null;
  sender_name: string;
  reply_to: string | null;
  signup_enabled: boolean;
  reset_enabled: boolean;
  signup_banner_url: string | null;
  reset_banner_url: string | null;
  signup_subject: string;
  reset_subject: string;
  brand_color: string;
};

export async function loadEmailSettings(): Promise<EmailSettings | null> {
  const supabase = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false, storage: undefined } },
  );
  const { data } = await supabase.from("email_settings").select("*").eq("id", true).maybeSingle();
  return (data as EmailSettings) ?? null;
}

function renderTemplate(opts: {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
  bannerUrl?: string | null;
  brandColor: string;
  senderName: string;
}) {
  const { title, body, ctaLabel, ctaUrl, bannerUrl, brandColor, senderName } = opts;
  const bannerImg = bannerUrl
    ? `<img src="${bannerUrl}" alt="${senderName}" style="width:100%;max-width:600px;display:block;border:0;border-radius:12px 12px 0 0" />`
    : "";
  const banner = bannerImg && ctaUrl ? `<a href="${ctaUrl}" target="_blank" style="display:block;text-decoration:none">${bannerImg}</a>` : bannerImg;
  const cta = ctaLabel && ctaUrl
    ? `<a href="${ctaUrl}" style="display:inline-block;background:${brandColor};color:#111;font-weight:700;padding:14px 26px;border-radius:10px;text-decoration:none;font-family:Arial,sans-serif">${ctaLabel}</a>`
    : "";
  return `<!doctype html><html><body style="margin:0;padding:0;background:#0b0b12;font-family:Arial,sans-serif;color:#e8e8ee">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b12;padding:24px 12px">
      <tr><td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#12121b;border:1px solid rgba(255,255,255,.06);border-radius:14px;overflow:hidden">
          ${banner ? `<tr><td>${banner}</td></tr>` : ""}
          <tr><td style="padding:28px 28px 8px 28px">
            <h1 style="margin:0 0 8px 0;font-size:22px;color:#fff">${title}</h1>
          </td></tr>
          <tr><td style="padding:0 28px 8px 28px;font-size:15px;line-height:1.6;color:#c9c9d4">${body}</td></tr>
          ${cta ? `<tr><td align="center" style="padding:22px 28px">${cta}</td></tr>` : ""}
          <tr><td style="padding:18px 28px 28px 28px;font-size:12px;color:#7a7a8a;border-top:1px solid rgba(255,255,255,.06)">
            Enviado por <strong style="color:${brandColor}">${senderName}</strong>. Se você não solicitou este e-mail, ignore-o.
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body></html>`;
}

export async function sendBrevoEmail(input: {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  settings: EmailSettings;
}) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) throw new Error("BREVO_API_KEY não configurada.");
  if (apiKey.startsWith("xsmtpsib-")) {
    throw new Error("A chave configurada é SMTP da Brevo (começa com xsmtpsib-) e não funciona aqui. Configure uma API Key v3 da Brevo, que começa com xkeysib-.");
  }
  if (!apiKey.startsWith("xkeysib-")) {
    throw new Error("Chave Brevo inválida. Use uma API Key v3 da Brevo, que começa com xkeysib-.");
  }
  if (!input.settings.sender_email) throw new Error("Remetente não configurado. Configure em Admin › E-mails.");

  const res = await fetch(BREVO_API, {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "content-type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      sender: { name: input.settings.sender_name, email: input.settings.sender_email },
      to: [{ email: input.to, name: input.toName || input.to }],
      ...(input.settings.reply_to ? { replyTo: { email: input.settings.reply_to } } : {}),
      subject: input.subject,
      htmlContent: input.html,
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    console.error(`Brevo send failed [${res.status}]: ${errorBody}`);
    throw new Error(`Brevo [${res.status}]: ${errorBody}`);
  }
  return (await res.json()) as { messageId?: string };
}

export async function checkBrevoSender(settings: EmailSettings | null) {
  const apiKey = process.env.BREVO_API_KEY?.trim();
  if (!apiKey) return { ok: false as const, status: "missing_key" as const, message: "Chave Brevo não configurada." };
  if (apiKey.startsWith("xsmtpsib-")) return { ok: false as const, status: "smtp_key" as const, message: "A chave salva é SMTP; use uma API Key v3 iniciada por xkeysib-." };
  if (!apiKey.startsWith("xkeysib-")) return { ok: false as const, status: "invalid_key" as const, message: "Chave Brevo inválida." };
  if (!settings?.sender_email) return { ok: false as const, status: "missing_sender" as const, message: "Remetente não configurado." };

  const res = await fetch(BREVO_SENDERS_API, {
    method: "GET",
    headers: { "api-key": apiKey, accept: "application/json" },
  });
  const text = await res.text();
  if (!res.ok) {
    return { ok: false as const, status: "api_error" as const, message: `Brevo [${res.status}]: ${text}` };
  }
  const payload = JSON.parse(text || "{}") as { senders?: Array<{ email?: string; name?: string; active?: boolean }> };
  const sender = payload.senders?.find((s) => s.email?.toLowerCase() === settings.sender_email?.toLowerCase());
  if (!sender) {
    return { ok: false as const, status: "sender_not_found" as const, message: `O remetente ${settings.sender_email} não aparece como remetente verificado na Brevo.` };
  }
  if (sender.active === false) {
    return { ok: false as const, status: "sender_inactive" as const, message: `O remetente ${settings.sender_email} existe na Brevo, mas ainda não está ativo/verificado.` };
  }
  return { ok: true as const, status: "ready" as const, message: `API e remetente ${settings.sender_email} estão prontos na Brevo.` };
}

export async function sendSignupWelcome(email: string, name: string | undefined, ctaUrl?: string) {
  const settings = await loadEmailSettings();
  if (!settings || !settings.signup_enabled) return { skipped: true as const };
  const html = renderTemplate({
    title: `Confirme seu e-mail${name ? `, ${name.split(" ")[0]}` : ""}`,
    body: `<p>Seu cadastro na <strong>${settings.sender_name}</strong> foi realizado com sucesso.</p>
           <p>Falta apenas confirmar seu e-mail para ativar sua conta com segurança.</p>`,
    ctaLabel: ctaUrl ? "Confirmar e-mail" : undefined,
    ctaUrl,
    bannerUrl: settings.signup_banner_url,
    brandColor: settings.brand_color,
    senderName: settings.sender_name,
  });
  await sendBrevoEmail({ to: email, toName: name, subject: settings.signup_subject, html, settings });
  return { skipped: false as const };
}

export async function sendPasswordReset(email: string, resetUrl: string) {
  const settings = await loadEmailSettings();
  if (!settings || !settings.reset_enabled) return { skipped: true as const };
  const html = renderTemplate({
    title: "Redefinição de senha",
    body: `<p>Recebemos uma solicitação para redefinir sua senha.</p>
           <p>Clique no botão abaixo para criar uma nova senha. Este link expira em 1 hora.</p>`,
    ctaLabel: "Redefinir minha senha",
    ctaUrl: resetUrl,
    bannerUrl: settings.reset_banner_url,
    brandColor: settings.brand_color,
    senderName: settings.sender_name,
  });
  await sendBrevoEmail({ to: email, subject: settings.reset_subject, html, settings });
  return { skipped: false as const };
}