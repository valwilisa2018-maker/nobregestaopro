import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingCart, KanbanSquare, Users, UserCheck, Briefcase,
  FileText, Settings, LogOut, Crown, ListTodo, Database,
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
      { title: "Vendas", url: "/sales", icon: ShoppingCart },
      { title: "Produção (Kanban)", url: "/kanban", icon: KanbanSquare },
      { title: "Serviços a Fazer", url: "/services-todo", icon: ListTodo },
    ],
  },
  {
    label: "Cadastros",
    items: [
      { title: "Clientes", url: "/customers", icon: Users },
      { title: "Vendedores", url: "/sellers", icon: UserCheck },
      { title: "Produtores", url: "/producers", icon: Briefcase },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Notas Fiscais", url: "/invoices", icon: FileText },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Backup", url: "/backup", icon: Database },
      { title: "Configurações", url: "/admin", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const current = useRouterState({ select: (s) => s.location.pathname });

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--gradient-primary)", boxShadow: "var(--shadow-premium)" }}>
            <Crown className="w-5 h-5 text-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="font-bold tracking-tight text-sidebar-foreground">Nobre MKT</div>
              <div className="text-[10px] uppercase tracking-widest text-primary">Premium</div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel>{g.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((it) => {
                  const active = current === it.url || current.startsWith(it.url + "/");
                  return (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={it.title}>
                        <Link to={it.url} className="flex items-center gap-3">
                          <it.icon className="w-4 h-4" />
                          <span>{it.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={logout} tooltip="Sair">
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}