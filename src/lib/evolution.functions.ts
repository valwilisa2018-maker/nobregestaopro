import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function getConfig() {
  const url = process.env.EVOLUTION_API_URL;
  const key = process.env.EVOLUTION_API_KEY;
  if (!url || !key) throw new Error("Evolution API não configurada");
  return { url: url.replace(/\/$/, ""), key };
}

async function evoFetch(path: string, init: RequestInit = {}) {
  const { url, key } = getConfig();
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    throw new Error(
      `Evolution ${res.status}: ${typeof body === "string" ? body : JSON.stringify(body)}`,
    );
  }
  return body;
}

export const evolutionCreateInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    try {
      return await evoFetch("/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: data.instanceName,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
        }),
      });
    } catch (e: any) {
      // If already exists, just try to connect (returns QR)
      if (String(e?.message ?? "").includes("already")) {
        return await evoFetch(`/instance/connect/${data.instanceName}`);
      }
      throw e;
    }
  });

export const evolutionGetQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connect/${data.instanceName}`);
  });

export const evolutionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/connectionState/${data.instanceName}`);
  });

export const evolutionLogout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { instanceName: string }) => d)
  .handler(async ({ data }) => {
    return await evoFetch(`/instance/logout/${data.instanceName}`, { method: "DELETE" });
  });