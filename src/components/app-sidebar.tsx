import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Bot, BookOpen, Workflow,
  MessageCircle, Brain, Users, MessagesSquare, History, ScrollText,
  Settings, UserCog, ShieldCheck, DollarSign, Palette, Code2, Webhook, Puzzle, LogOut,
  LineChart, Activity, CreditCard, Shield, User, Crown, Building2, Plug,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";

const groups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Agentes", url: "/agents", icon: Bot },
      { title: "Chats", url: "/conversations", icon: MessagesSquare },
      { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Automação",
    items: [
      { title: "Integrações", url: "/integrations", icon: Puzzle },
      { title: "APIs", url: "/api", icon: Code2 },
      { title: "Workflows", url: "/flows", icon: Workflow },
      { title: "Webhooks", url: "/webhooks", icon: Webhook },
      { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", url: "/history", icon: LineChart },
      { title: "Monitoramento", url: "/logs", icon: Activity },
      { title: "Prompts", url: "/prompt", icon: Brain },
      { title: "Clientes", url: "/clients", icon: Users },
      { title: "Histórico", url: "/history", icon: History },
      { title: "Logs", url: "/logs", icon: ScrollText },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Meu Plano", url: "/billing", icon: CreditCard },
      { title: "Financeiro", url: "/billing", icon: DollarSign },
    ],
  },
  {
    label: "Conta",
    items: [
      { title: "Configurações", url: "/settings", icon: Settings },
      { title: "Perfil", url: "/settings", icon: User },
    ],
  },
];

const adminGroup = {
  label: "Admin",
  items: [
    { title: "Painel Admin", url: "/admin", icon: Crown },
    { title: "Clientes", url: "/admin/clients", icon: Building2 },
    { title: "Instâncias", url: "/admin/instances", icon: Plug },
    { title: "Agentes (todos)", url: "/admin/agents", icon: Bot },
    { title: "Faturamento", url: "/admin/billing", icon: DollarSign },
    { title: "Planos", url: "/admin/plans", icon: CreditCard },
    { title: "Usuários", url: "/admin/users", icon: UserCog },
    { title: "Permissões", url: "/admin/permissions", icon: ShieldCheck },
    { title: "Segurança", url: "/admin/security", icon: Shield },
    { title: "White Label", url: "/white-label", icon: Palette },
  ],
};

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "admin" });
      if (!cancelled) setIsAdmin(!!data);
    })();
    return () => { cancelled = true; };
  }, []);

  const allGroups = isAdmin ? [...groups, adminGroup] : groups;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="p-4 border-b border-sidebar-border/60">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <img src={logoAsset.url} alt="Agent IA" className="h-9 w-9 rounded-xl object-cover ring-1 ring-primary/40" />
            <div className="absolute inset-0 rounded-xl opacity-40 blur-md -z-10" style={{ background: "var(--gradient-primary)" }} />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <span className="font-black tracking-tight bg-clip-text text-transparent"
                style={{ backgroundImage: "var(--gradient-primary)" }}>AGENT IA</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-widest">Enterprise</span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {allGroups.map((g) => (
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
        <SidebarMenuButton onClick={() => supabase.auth.signOut()} tooltip="Sair">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}