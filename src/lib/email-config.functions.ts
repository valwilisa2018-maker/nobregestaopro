import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EmailSettingsInput = {
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

type BrevoKeyStatus = "missing" | "smtp" | "valid" | "invalid";

function getBrevoKeyStatus(): BrevoKeyStatus {
  const key = process.env.BREVO_API_KEY?.trim();
  if (!key) return "missing";
  if (key.startsWith("xsmtpsib-")) return "smtp";
  if (key.startsWith("xkeysib-")) return "valid";
  return "invalid";
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: isMaster } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "master" });
    if (!isMaster) throw new Error("forbidden");
    const { loadEmailSettings } = await import("./email-brevo.server");
    const s = await loadEmailSettings();
    const brevoKeyStatus = getBrevoKeyStatus();
    return { settings: s, hasBrevoKey: brevoKeyStatus === "valid", brevoKeyStatus };
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: EmailSettingsInput) => d)
  .handler(async ({ data, context }) => {
    const { data: isMaster } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "master" });
    if (!isMaster) throw new Error("forbidden");
    const { error } = await context.supabase
      .from("email_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { to: string; kind: "signup" | "reset" }) => d)
  .handler(async ({ data, context }) => {
    const { data: isMaster } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "master" });
    if (!isMaster) throw new Error("forbidden");
    const { loadEmailSettings, sendBrevoEmail } = await import("./email-brevo.server");
    const settings = await loadEmailSettings();
    if (!settings) throw new Error("Configurações não encontradas.");
    const isSignup = data.kind === "signup";
    const bannerUrl = isSignup ? settings.signup_banner_url : settings.reset_banner_url;
    const html = `<!doctype html><html><body style="margin:0;padding:0;background:#0b0b12;font-family:Arial,sans-serif;color:#e8e8ee">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px"><tr><td align="center">
        <table role="presentation" width="600" style="max-width:600px;width:100%;background:#12121b;border-radius:14px;overflow:hidden;border:1px solid rgba(255,255,255,.06)">
          ${bannerUrl ? `<tr><td><img src="${bannerUrl}" alt="banner" style="width:100%;display:block;border:0" /></td></tr>` : ""}
          <tr><td style="padding:28px;color:#fff">
            <h1 style="margin:0 0 10px 0">${isSignup ? "Teste de e-mail de cadastro ✅" : "Teste de e-mail de reset ✅"}</h1>
            <p style="color:#c9c9d4">Este é um envio de teste da <strong style="color:${settings.brand_color}">${settings.sender_name}</strong> via Brevo.</p>
          </td></tr>
        </table>
      </td></tr></table>
    </body></html>`;
    const result = await sendBrevoEmail({
      to: data.to,
      subject: isSignup ? settings.signup_subject : settings.reset_subject,
      html,
      settings,
    });
    return { ok: true, messageId: result.messageId };
  });
