import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Plug, Bot, Brain, BookOpen, Workflow, FileText, Wrench,
  MessageCircle, AudioLines, Sparkles, Users, MessagesSquare, History, ScrollText,
  Settings, UserCog, ShieldCheck, DollarSign, Palette, Code2, Webhook, Puzzle, LogOut,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";

const groups = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Conexões", url: "/connections", icon: Plug },
      { title: "Agentes", url: "/agents", icon: Bot },
      { title: "IA", url: "/ai", icon: Sparkles },
      { title: "Conhecimento", url: "/knowledge", icon: BookOpen },
      { title: "Fluxos", url: "/flows", icon: Workflow },
      { title: "Documentos", url: "/documents", icon: FileText },
      { title: "Ferramentas", url: "/tools", icon: Wrench },
    ],
  },
  {
    label: "Comunicação",
    items: [
      { title: "WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Áudios", url: "/audios", icon: AudioLines },
      { title: "Prompt", url: "/prompt", icon: Brain },
      { title: "Clientes", url: "/clients", icon: Users },
      { title: "Conversas", url: "/conversations", icon: MessagesSquare },
      { title: "Histórico", url: "/history", icon: History },
      { title: "Logs", url: "/logs", icon: ScrollText },
    ],
  },
  {
    label: "Sistema",
    items: [
      { title: "Configurações", url: "/settings", icon: Settings },
      { title: "Usuários", url: "/users", icon: UserCog },
      { title: "Permissões", url: "/permissions", icon: ShieldCheck },
      { title: "Financeiro", url: "/billing", icon: DollarSign },
      { title: "White Label", url: "/white-label", icon: Palette },
      { title: "API", url: "/api", icon: Code2 },
      { title: "Webhooks", url: "/webhooks", icon: Webhook },
      { title: "Integrações", url: "/integrations", icon: Puzzle },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="p-4">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold">IA</div>
          {!collapsed && <span className="font-semibold">WhatsApp IA</span>}
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