import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session, User } from "@supabase/supabase-js";

export type AppRole = "admin" | "vendedor" | "produtor" | "financeiro" | "super_admin";

export interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s?.user) {
        setTimeout(async () => {
          const { data } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id" as any, s.user.id);
          setRoles((data ?? []).map((r) => r.role as AppRole));
        }, 0);
      } else {
        setRoles([]);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
      if (data.session?.user) {
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id" as any, data.session.user.id)
          .then(({ data: r }) => setRoles((r ?? []).map((x) => x.role as AppRole)));
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { user: session?.user ?? null, session, roles, loading };
}

export const hasRole = (roles: AppRole[], role: AppRole) => roles.includes(role);
export const isAdmin = (roles: AppRole[]) => roles.includes("admin");
export const isSuperAdmin = (roles: AppRole[]) => roles.includes("super_admin");

// Formatação vive em @/lib/format. Reexportado aqui apenas por compatibilidade
// com os imports existentes — prefira importar de "@/lib/format".
export { formatCurrency } from "@/lib/format";