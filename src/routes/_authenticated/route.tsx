import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Loader2 } from "lucide-react";
import { useTelaoSettingsSync } from "@/hooks/use-telao-settings-sync";
import { ReleaseNoteCard } from "@/components/release-note-card";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useTelaoSettingsSync();

  useEffect(() => {
    let mounted = true;
    let authSubscription: { unsubscribe: () => void } | null = null;

    const checkSession = async (retryCount = 0) => {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        
        if (!mounted) return;

        if (!data.session) {
          console.warn("No session found, redirecting to login");
          // Pequena espera antes de redirecionar para evitar loops rápidos
          setTimeout(() => {
            if (mounted) navigate({ to: "/login" });
          }, 500);
        } else {
          setAuthed(true);
        }
      } catch (err) {
        console.error(`Session check error (attempt ${retryCount + 1}):`, err);
        if (retryCount < 2 && mounted) {
          // Exponential backoff retry for network issues
          setTimeout(() => checkSession(retryCount + 1), 1000 * (retryCount + 1));
        } else if (mounted) {
          navigate({ to: "/login" });
        }
      } finally {
        if (mounted && retryCount >= 2) setReady(true);
        else if (mounted && !ready && setReady) {
          // If we got a result (even negative) or error out after retries
          setReady(true);
        }
      }
    };

    checkSession();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!mounted) return;
      setAuthed(!!s);
      if (!s) {
        console.warn("Auth state changed to unauthenticated, redirecting");
        navigate({ to: "/login" });
      }
    });
    authSubscription = sub.subscription;

    return () => {
      mounted = false;
      if (authSubscription) authSubscription.unsubscribe();
    };
  }, [navigate, ready]);

  if (!ready || !authed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">Autenticando...</p>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex-1 min-w-0">
          <header className="h-16 flex items-center gap-3 border-b border-border/40 px-4 md:px-6 sticky top-0 z-20 bg-background/70 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60">
            <SidebarTrigger className="rounded-lg hover:bg-accent/60 transition-colors duration-200" />
            <div className="h-6 w-px bg-border/60" />
            <div className="flex flex-col leading-tight min-w-0">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workspace
              </span>
              <span className="text-sm font-semibold tracking-tight truncate">
                Gestão Nobre MKT
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Online
              </span>
            </div>
          </header>
          <main className="flex-1 min-w-0 p-4 md:p-6 overflow-x-hidden">
            <Outlet />
            <ReleaseNoteCard />
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}