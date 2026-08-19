import { describe, it, expect, vi, beforeEach } from "vitest";
import { packageSchema, validatePackage } from "./package-schema";

const base = {
  name: "Starter",
  tokens: 100_000,
  price_cents: 1990,
  currency: "BRL" as const,
  badge: null as string | null,
  sort_order: 0,
  is_active: true,
};

describe("packageSchema", () => {
  it("accepts a valid package", () => {
    expect(packageSchema.safeParse(base).success).toBe(true);
  });

  describe("name", () => {
    it("rejects when too short", () => {
      const r = packageSchema.safeParse({ ...base, name: "a" });
      expect(r.success).toBe(false);
    });
    it("rejects when > 80 chars", () => {
      const r = packageSchema.safeParse({ ...base, name: "x".repeat(81) });
      expect(r.success).toBe(false);
    });
  });

  describe("tokens", () => {
    it.each([0, -1, 1.5, 1_000_000_001])("rejects invalid %s", (tokens) => {
      expect(packageSchema.safeParse({ ...base, tokens }).success).toBe(false);
    });
    it("accepts 1 and max", () => {
      expect(packageSchema.safeParse({ ...base, tokens: 1 }).success).toBe(true);
      expect(packageSchema.safeParse({ ...base, tokens: 1_000_000_000 }).success).toBe(true);
    });
  });

  describe("price_cents", () => {
    it.each([0, -100, 1.2, 100_000_001])("rejects invalid %s", (price_cents) => {
      expect(packageSchema.safeParse({ ...base, price_cents }).success).toBe(false);
    });
    it("accepts minimum and maximum", () => {
      expect(packageSchema.safeParse({ ...base, price_cents: 1 }).success).toBe(true);
      expect(packageSchema.safeParse({ ...base, price_cents: 100_000_000 }).success).toBe(true);
    });
  });

  describe("currency", () => {
    it.each(["BRL", "USD", "EUR"])("accepts %s", (currency) => {
      expect(packageSchema.safeParse({ ...base, currency }).success).toBe(true);
    });
    it("rejects unknown currencies", () => {
      expect(packageSchema.safeParse({ ...base, currency: "GBP" }).success).toBe(false);
      expect(packageSchema.safeParse({ ...base, currency: "brl" }).success).toBe(false);
    });
    it("defaults to BRL when omitted", () => {
      const { currency: _c, ...noCurrency } = base;
      const r = packageSchema.safeParse(noCurrency);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.currency).toBe("BRL");
    });
  });

  describe("is_active", () => {
    it("requires a boolean", () => {
      expect(packageSchema.safeParse({ ...base, is_active: true }).success).toBe(true);
      expect(packageSchema.safeParse({ ...base, is_active: false }).success).toBe(true);
      expect(packageSchema.safeParse({ ...base, is_active: "yes" }).success).toBe(false);
      expect(packageSchema.safeParse({ ...base, is_active: 1 }).success).toBe(false);
    });
  });
});

describe("validatePackage", () => {
  it("returns ok with parsed data on success", () => {
    const r = validatePackage(base);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.data.name).toBe("Starter");
  });

  it("returns first error message on failure", () => {
    const r = validatePackage({ ...base, price_cents: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Preço/i);
  });
});

/**
 * savePkg behavior — the pure validation branch. We simulate the same call
 * sequence savePkg does (validate → toast on failure → insert/update).
 */
describe("savePkg behavior", () => {
  const toast = { error: vi.fn(), success: vi.fn() };
  const insert = vi.fn().mockResolvedValue({ error: null });
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  const from = vi.fn().mockReturnValue({ insert, update });

  async function savePkg(p: Record<string, unknown> & { id: string }) {
    const parsed = validatePackage({
      name: p.name,
      tokens: p.tokens,
      price_cents: p.price_cents,
      currency: p.currency ?? "BRL",
      badge: p.badge && String(p.badge).length ? p.badge : null,
      sort_order: p.sort_order,
      is_active: p.is_active,
    });
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const { currency: _c, ...payload } = parsed.data;
    const res = p.id.startsWith("new-")
      ? await from("credit_packages").insert(payload)
      : await from("credit_packages").update(payload).eq("id", p.id);
    if (res.error) toast.error(res.error.message);
    else toast.success("Pacote salvo");
  }

  beforeEach(() => vi.clearAllMocks());

  it("inserts new packages when id starts with 'new-'", async () => {
    await savePkg({ ...base, id: "new-1" });
    expect(insert).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith("Pacote salvo");
  });

  it("updates existing packages", async () => {
    await savePkg({ ...base, id: "abc-123" });
    expect(update).toHaveBeenCalledTimes(1);
    expect(insert).not.toHaveBeenCalled();
  });

  it("aborts and toasts on invalid price", async () => {
    await savePkg({ ...base, id: "new-1", price_cents: 0 });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("aborts on invalid currency", async () => {
    await savePkg({ ...base, id: "new-1", currency: "GBP" });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("aborts on invalid tokens", async () => {
    await savePkg({ ...base, id: "new-1", tokens: -5 });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("aborts on invalid is_active", async () => {
    await savePkg({ ...base, id: "new-1", is_active: "yes" });
    expect(insert).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  it("strips currency from the DB payload", async () => {
    await savePkg({ ...base, id: "new-1" });
    const payload = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty("currency");
    expect(payload).toMatchObject({
      name: "Starter",
      tokens: 100_000,
      price_cents: 1990,
      is_active: true,
    });
  });
});
