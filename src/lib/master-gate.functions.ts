import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

type GateSession = { unlocked?: boolean; unlockedAt?: number };

function sessionConfig() {
  const password = process.env.MASTER_SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("MASTER_SESSION_SECRET não configurado (mínimo 32 chars).");
  }
  return {
    password,
    name: "master-gate",
    maxAge: 60 * 60 * 24 * 7, // 7 dias
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

function passwordMatches(input: string, expected: string): boolean {
  const a = createHash("sha256").update(input, "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export const isMasterUnlocked = createServerFn({ method: "GET" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  return { unlocked: Boolean(session.data.unlocked) };
});

export const unlockMaster = createServerFn({ method: "POST" })
  .inputValidator((data: { password: string }) => {
    if (!data || typeof data.password !== "string" || data.password.length === 0 || data.password.length > 200) {
      throw new Error("Senha inválida.");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const expected = process.env.MASTER_PASSWORD;
    if (!expected || expected.length < 6) {
      return { ok: false as const, error: "not_configured" };
    }
    if (!passwordMatches(data.password, expected)) {
      return { ok: false as const, error: "invalid" };
    }
    const session = await useSession<GateSession>(sessionConfig());
    await session.update({ unlocked: true, unlockedAt: Date.now() });
    return { ok: true as const };
  });

export const lockMaster = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useSession<GateSession>(sessionConfig());
  await session.clear();
  return { ok: true as const };
});