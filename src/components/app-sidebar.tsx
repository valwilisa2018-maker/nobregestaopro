import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Plug, Bot, Brain, BookOpen, Workflow, FileText, Wrench,
  MessageCircle, AudioLines, Brain, Users, MessagesSquare, History, ScrollText,
  Settings, UserCog, ShieldCheck, DollarSign, Palette, Code2, Webhook, Puzzle, LogOut,
  Boxes, LineChart, Activity, CreditCard, Shield, User,
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
      { title: "Documentos", url: "/documents", icon: FileText },
    ],
  },
  {
    label: "Automação",
    items: [
      { title: "Integrações", url: "/integrations", icon: Puzzle },
      { title: "APIs", url: "/api", icon: Code2 },
      { title: "Ferramentas", url: "/tools", icon: Wrench },
      { title: "MCP Servers", url: "/tools", icon: Boxes },
      { title: "Workflows", url: "/flows", icon: Workflow },
      { title: "Webhooks", url: "/webhooks", icon: Webhook },
      { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Conexões", url: "/connections", icon: Plug },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", url: "/history", icon: LineChart },
      { title: "Monitoramento", url: "/logs", icon: Activity },
      { title: "IA", url: "/ai", icon: Brain },
      { title: "Prompts", url: "/prompt", icon: Brain },
      { title: "Áudios", url: "/audios", icon: AudioLines },
      { title: "Clientes", url: "/clients", icon: Users },
      { title: "Histórico", url: "/history", icon: History },
      { title: "Logs", url: "/logs", icon: ScrollText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Usuários", url: "/users", icon: UserCog },
      { title: "Permissões", url: "/permissions", icon: ShieldCheck },
      { title: "Assinaturas", url: "/billing", icon: CreditCard },
      { title: "Financeiro", url: "/billing", icon: DollarSign },
      { title: "Segurança", url: "/permissions", icon: Shield },
      { title: "White Label", url: "/white-label", icon: Palette },
      { title: "Configurações", url: "/settings", icon: Settings },
      { title: "Perfil", url: "/settings", icon: User },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

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
        <SidebarMenuButton onClick={() => supabase.auth.signOut()} tooltip="Sair">
          <LogOut className="h-4 w-4" />
          {!collapsed && <span>Sair</span>}
        </SidebarMenuButton>
      </SidebarFooter>
    </Sidebar>
  );
}