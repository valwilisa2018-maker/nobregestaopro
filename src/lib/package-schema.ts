import { z } from "zod";

export const CURRENCIES = ["BRL", "USD", "EUR"] as const;

export const packageSchema = z.object({
  name: z.string().trim().min(2, "Nome mínimo 2 caracteres").max(80, "Nome muito longo"),
  tokens: z
    .number()
    .int("Tokens deve ser inteiro")
    .positive("Tokens deve ser > 0")
    .max(1_000_000_000, "Tokens excede o limite"),
  price_cents: z
    .number()
    .int()
    .min(1, "Preço deve ser > 0")
    .max(100_000_000, "Preço excede o limite"),
  currency: z.enum(CURRENCIES).default("BRL"),
  badge: z.string().trim().max(30).nullable(),
  sort_order: z.number().int().min(0).max(9999),
  is_active: z.boolean(),
});

export type PackageInput = z.infer<typeof packageSchema>;

export type SavePkgResult = { ok: true; data: PackageInput } | { ok: false; error: string };

/** Pure validator used by savePkg — kept side-effect free for testability. */
export function validatePackage(input: unknown): SavePkgResult {
  const parsed = packageSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  return { ok: true, data: parsed.data };
}
