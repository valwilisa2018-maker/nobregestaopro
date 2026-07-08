import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { MasterSidebar } from "@/components/master-sidebar";
import { Toaster } from "@/components/ui/sonner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { Crown } from "lucide-react";

export const Route = createFileRoute("/master")({
  component: MasterLayout,
});

function MasterLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [check, setCheck] = useState<"loading" | "ok" | "deny">("loading");

  useEffect(() => {
    if (loading) return;
    if (!session) { navigate({ to: "/auth" }); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase.rpc("has_role", { _user_id: session.user.id, _role: "master" });
      if (cancelled) return;
      if (data) setCheck("ok"); else { setCheck("deny"); navigate({ to: "/dashboard" }); }
    })();
    return () => { cancelled = true; };
  }, [loading, session, navigate]);

  if (loading || check === "loading") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Verificando acesso Master…</div>;
  }
  if (check === "deny") return null;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <MasterSidebar />
        <div className="flex-1 flex flex-col">
          <header className="h-12 flex items-center border-b px-2 gap-2 bg-gradient-to-r from-amber-500/5 via-transparent to-transparent">
            <SidebarTrigger />
            <div className="flex items-center gap-2 text-sm font-semibold text-amber-500">
              <Crown className="h-4 w-4" />
              <span>Painel Admin Master</span>
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6 bg-muted/20 min-w-0">
            <Outlet />
          </main>
        </div>
        <Toaster />
      </div>
    </SidebarProvider>
  );
}