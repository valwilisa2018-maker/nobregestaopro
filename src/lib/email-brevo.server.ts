import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const BREVO_API = "https://api.brevo.com/v3/smtp/email";

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
  const banner = bannerUrl
    ? `<img src="${bannerUrl}" alt="${senderName}" style="width:100%;max-width:600px;display:block;border:0;border-radius:12px 12px 0 0" />`
    : "";
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

export async function sendSignupWelcome(email: string, name: string | undefined, ctaUrl?: string) {
  const settings = await loadEmailSettings();
  if (!settings || !settings.signup_enabled) return { skipped: true as const };
  const html = renderTemplate({
    title: `Bem-vindo(a)${name ? `, ${name}` : ""}! 🎉`,
    body: `<p>Sua conta na <strong>${settings.sender_name}</strong> foi criada com sucesso.</p>
           <p>Acesse a plataforma, ative seu plano e comece a automatizar seu WhatsApp com IA.</p>`,
    ctaLabel: ctaUrl ? "Acessar plataforma" : undefined,
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