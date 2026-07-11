import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { PlanExpiryBanner } from "@/components/plan-status";
import { NotificationBell } from "@/components/notification-bell";
import { AnnouncementModal } from "@/components/announcement-modal";
import { MaintenanceBanner } from "@/components/maintenance-banner";
import { PlanGate } from "@/components/plan-gate";
import { useEffect } from "react";

export const Route = createFileRoute("/_authenticated")({
  component: AuthedLayout,
});

function AuthedLayout() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  if (loading || !session) {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground">Carregando…</div>;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col">
          <MaintenanceBanner />
          <PlanExpiryBanner />
          <header className="h-12 flex items-center border-b px-2 gap-2">
            <SidebarTrigger />
            <div className="ml-auto flex items-center gap-1">
              <NotificationBell />
            </div>
          </header>
          <main className="flex-1 p-3 sm:p-6 bg-muted/20 min-w-0">
            <PlanGate>
              <Outlet />
            </PlanGate>
          </main>
          <AnnouncementModal />
        </div>
      </div>
    </SidebarProvider>
  );
}