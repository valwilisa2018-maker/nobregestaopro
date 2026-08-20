import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { Clock } from "lucide-react";
import { useTelaoSettingsSync } from "@/hooks/use-telao-settings-sync";
import { ReleaseNoteCard } from "@/components/release-note-card";
import { TopWeather } from "@/components/top-weather";
import { formatBrasiliaTime } from "@/lib/format";
import { AccessProvider, useAccess } from "@/components/access-provider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NobreLoader } from "@/components/nobre-loader";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useTelaoSettingsSync();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [nowBR, setNowBR] = useState(() => formatBrasiliaTime());
  useEffect(() => {
    const id = setInterval(() => setNowBR(formatBrasiliaTime()), 1000);
    return () => clearInterval(id);
  }, []);

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
          return;
        } else if (mounted) {
          navigate({ to: "/login" });
        }
      } finally {
        if (mounted) setReady(true);
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
  }, [navigate]);

  if (!ready || !authed) {
    return <NobreLoader fullScreen label="Preparando seu acesso..." />;
  }

  return (
    <AccessProvider>
      <ProtectedWorkspace pathname={pathname} nowBR={nowBR} />
    </AccessProvider>
  );
}

function ProtectedWorkspace({ pathname, nowBR }: { pathname: string; nowBR: string }) {
  const access = useAccess();
  const denied = !access.loading && !access.error && !access.canVisit(pathname);

  useEffect(() => {
    if (denied && access.firstAllowedPath) {
      window.location.replace(access.firstAllowedPath);
    }
  }, [access.firstAllowedPath, denied]);

  if (access.loading) {
    return <NobreLoader fullScreen label="Carregando seu workspace..." />;
  }
  if (access.error) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso indisponível</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Sua conta está inativa ou não foi possível validar suas permissões.
            </p>
            <Button className="w-full" onClick={() => supabase.auth.signOut()}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }
  if (denied && access.firstAllowedPath) {
    return <NobreLoader fullScreen label="Abrindo seu módulo..." />;
  }
  if (denied) {
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Acesso negado</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Você não possui permissão para visualizar este módulo.
            </p>
            <Button className="w-full" onClick={() => supabase.auth.signOut()}>
              Sair
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="flex h-svh min-h-0 w-full overflow-hidden bg-background">
        <AppSidebar />
        <SidebarInset className="h-svh min-h-0 flex-1 min-w-0 overflow-hidden">
          <header className="sticky top-0 z-20 flex min-h-16 flex-wrap items-center gap-3 border-b border-border/40 bg-background/70 px-4 py-3 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60 md:px-6">
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
              <TopWeather />
              <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium tabular-nums text-muted-foreground backdrop-blur">
                <Clock className="w-3 h-3 text-emerald-500" />
                <span className="tracking-wide">{nowBR}</span>
                <span className="text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
                  BRT
                </span>
              </span>
            </div>
          </header>
          <main className="flex-1 min-h-0 min-w-0 overflow-x-hidden overflow-y-auto overscroll-contain p-4 md:p-6 lg:p-8">
            <div key={pathname} className="animate-fade-up space-y-6">
              <Outlet />
              <ReleaseNoteCard />
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
