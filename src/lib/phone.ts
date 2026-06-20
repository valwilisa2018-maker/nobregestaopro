// Utilidades para telefone brasileiro + WhatsApp Web

export function digitsOnly(v?: string | null): string {
  return (v ?? "").replace(/\D/g, "");
}

/**
 * Formata um telefone brasileiro no padrão (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX.
 * Aceita string parcial enquanto o usuário digita.
 */
export function formatPhoneBR(raw?: string | null): string {
  let d = digitsOnly(raw);
  // remove DDI 55 se vier colado (ex.: 5535999999999)
  if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
  d = d.slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

/** Telefone BR válido tem 10 ou 11 dígitos. */
export function isValidPhoneBR(raw?: string | null): boolean {
  const d = digitsOnly(raw);
  return d.length === 10 || d.length === 11;
}

/**
 * Gera link do WhatsApp Web (web.whatsapp.com/send) com DDI 55 prefixado.
 * Retorna null se o telefone não tiver dígitos suficientes.
 */
export function waHref(phone?: string | null, text?: string): string | null {
  let d = digitsOnly(phone);
  if (!d) return null;
  if (d.length <= 11) d = `55${d}`;
  const base = `https://web.whatsapp.com/send?phone=${d}`;
  return text ? `${base}&text=${encodeURIComponent(text)}` : base;
}