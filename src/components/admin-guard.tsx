import { useEffect, useState, type ReactNode } from "react";
import { Navigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export function AdminGuard({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "ok" | "deny">("loading");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { if (!cancelled) setState("deny"); return; }
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) setState(data ? "ok" : "deny");
    })();
    return () => { cancelled = true; };
  }, []);
  if (state === "loading") return <div className="p-8 text-sm text-muted-foreground">Verificando permissões…</div>;
  if (state === "deny") return <Navigate to="/dashboard" />;
  return <>{children}</>;
}