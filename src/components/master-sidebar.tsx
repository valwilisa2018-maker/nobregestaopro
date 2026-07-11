import { Link, useRouterState } from "@tanstack/react-router";
import {
  Crown, LayoutDashboard, Users, DollarSign, Package, CreditCard, Megaphone,
  LifeBuoy, Bell, Settings2, Brain, Plug, KeyRound, Webhook, Cpu, Palette,
  ShieldCheck, LogOut, Sun, Moon, ArrowLeft, Zap,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";

const groups = [
  {
    label: "Visão Geral",
    items: [
      { title: "Dashboard Master", url: "/master", icon: LayoutDashboard },
    ],
  },
  {
    label: "Contas",
    items: [
      { title: "Clientes", url: "/master/clients", icon: Users },
      { title: "Permissões", url: "/permissions", icon: ShieldCheck },
      { title: "Notificações", url: "/master/notifications", icon: Bell },
      { title: "Anúncios", url: "/master/announcements", icon: Megaphone },
      { title: "Suporte", url: "/master/support", icon: LifeBuoy },
      { title: "Config. Suporte", url: "/master/support-settings", icon: Settings2 },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Visão Geral", url: "/master/financial", icon: DollarSign },
      { title: "Ativações", url: "/master/activations", icon: Zap },
      { title: "Pedidos", url: "/master/orders", icon: CreditCard },
      { title: "Planos", url: "/plans", icon: Crown },
      { title: "Config. Pagamento", url: "/master/payment-config", icon: Settings2 },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Cérebro Universal", url: "/brain", icon: Brain },
      { title: "Provedores IA", url: "/ai", icon: Cpu },
      { title: "Conexões", url: "/connections", icon: Plug },
      { title: "API Keys", url: "/api", icon: KeyRound },
      { title: "Webhooks", url: "/webhooks", icon: Webhook },
      { title: "White Label", url: "/white-label", icon: Palette },
      { title: "Personalização", url: "/master/branding", icon: Palette },
      { title: "Config. Global", url: "/admin-settings", icon: Settings2 },
    ],
  },
];

export function MasterSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { theme, toggle } = useTheme();

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-yellow-600 ring-1 ring-amber-400/40 shadow-lg shadow-amber-500/20">
            <Crown className="h-5 w-5 text-white" />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-black tracking-tight text-amber-500">ADMIN MASTER</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-widest">Painel da plataforma</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            {!collapsed && <SidebarGroupLabel>{g.label}</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item) => (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton asChild isActive={pathname === item.url} tooltip={item.title}>
                      <Link to={item.url} className="flex items-center gap-2">
                        <item.icon className="h-4 w-4" />
                        {!collapsed && <span>{item.title}</span>}
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-2">
        <SidebarMenuButton asChild tooltip="Voltar à plataforma">
          <Link to="/dashboard" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            {!collapsed && <span>Voltar à plataforma</span>}
          </Link>
        </SidebarMenuButton>
        <SidebarMenuButton onClick={toggle} tooltip={theme === "dark" ? "Modo claro" : "Modo escuro"}>
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {!collapsed && <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>}
        </SidebarMenuButton>
        <SidebarMenuButton onClick={() => supabase.auth.signOut()} tooltip="Sair">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}