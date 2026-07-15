import { useSession } from "@tanstack/react-start/server";

export type MasterSessionData = {
  adminId?: string;
  email?: string;
  name?: string;
};

function getSessionConfig() {
  const password = process.env.MASTER_SESSION_SECRET;
  if (!password) throw new Error("MASTER_SESSION_SECRET is not configured");
  return {
    password,
    name: "nobre-master-session",
    maxAge: 60 * 60 * 24 * 7, // 7 days
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

export async function getMasterSession() {
  return useSession<MasterSessionData>(getSessionConfig());
}

export async function requireMasterAdmin(): Promise<MasterSessionData & { adminId: string }> {
  const session = await getMasterSession();
  if (!session.data.adminId) {
    throw new Response("Unauthorized (master admin)", { status: 401 });
  }
  return session.data as MasterSessionData & { adminId: string };
}