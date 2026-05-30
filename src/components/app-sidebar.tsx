import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ShoppingCart, KanbanSquare, Users, UserCheck, Briefcase,
  FileText, Settings, LogOut, ListTodo, Database, Sun, Moon, Link2, Wallet, DollarSign,
} from "lucide-react";
import logoUrl from "@/assets/logo.png";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";

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
      { title: "Gerar Pagamento", url: "/payment-link", icon: Link2 },
      { title: "Financeiro", url: "/finance", icon: DollarSign },
      { title: "Notas Fiscais", url: "/invoices", icon: FileText },
      { title: "Comissões", url: "/commissions", icon: Wallet },
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
  const { theme, toggle } = useTheme();

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-3 px-2 py-3">
          <img src={logoUrl} alt="Nobre MKT" className="w-10 h-10 rounded-lg object-contain shrink-0"
            style={{ boxShadow: "var(--shadow-premium)" }} />
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
            <SidebarMenuButton onClick={toggle} tooltip={theme === "dark" ? "Modo claro" : "Modo escuro"}>
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
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