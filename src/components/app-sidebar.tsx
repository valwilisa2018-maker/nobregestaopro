import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ShoppingCart,
  KanbanSquare,
  Users,
  UserCheck,
  Briefcase,
  FileText,
  Settings,
  LogOut,
  ListTodo,
  Database,
  Sun,
  Moon,
  Link2,
  Wallet,
  DollarSign,
  Tv,
  AlertCircle,
  CreditCard,
  Sparkles,
  Clapperboard,
  FolderOpen,
  MessagesSquare,
  Smartphone,
  ShieldCheck,
} from "lucide-react";
import logoUrl from "@/assets/logo.png";
import { useEffect, useState } from "react";
import { getCachedWhiteLabelSettings, WHITE_LABEL_EVENT } from "@/lib/white-label";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import { useTheme } from "@/hooks/use-theme";
import { useAccess } from "@/components/access-provider";
import { moduleForPath } from "@/lib/access-control";

const groups = [
  {
    label: "Operação",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Vendas", url: "/sales", icon: ShoppingCart },
      { title: "Telão", url: "/telao", icon: Tv },
      { title: "Produção (Kanban)", url: "/kanban", icon: KanbanSquare },
      { title: "Serviços a Fazer", url: "/services-todo", icon: ListTodo },
      { title: "Pastas e Arquivos", url: "/pastas-arquivos", icon: FolderOpen },
      { title: "Chat Organizador", url: "/chat-organizador", icon: MessagesSquare },
      { title: "Operação Metas", url: "/operacao-meta", icon: Clapperboard },
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
      { title: "Pagamentos Cartão/PIX", url: "/pagarme-history", icon: CreditCard },
      { title: "Gerar Pagamento", url: "/payment-link", icon: Link2 },
      { title: "Financeiro", url: "/finance", icon: DollarSign },
      { title: "Valores Pendentes", url: "/pending-payments", icon: AlertCircle },
      { title: "Notas Fiscais", url: "/invoices", icon: FileText },
      { title: "Comissões", url: "/commissions", icon: Wallet },
    ],
  },
  {
    label: "Administração",
    items: [
      { title: "Planos & Assinatura", url: "/planos", icon: CreditCard },
      { title: "Backup", url: "/backup", icon: Database },
      { title: "Conectar WhatsApp", url: "/whatsapp", icon: Smartphone },
      { title: "Auditoria", url: "/auditoria", icon: ShieldCheck },
      { title: "Personalização", url: "/white-label", icon: Sparkles },
      { title: "Configurações", url: "/admin", icon: Settings },
      { title: "Usuários e Permissões", url: "/usuarios", icon: ShieldCheck },
    ],
  },
];

export function AppSidebar() {
  const [customLogo, setCustomLogo] = useState(() => getCachedWhiteLabelSettings().logo);
  useEffect(() => {
    const updateLogo = () => setCustomLogo(getCachedWhiteLabelSettings().logo);
    window.addEventListener(WHITE_LABEL_EVENT, updateLogo);
    return () => window.removeEventListener(WHITE_LABEL_EVENT, updateLogo);
  }, []);
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const current = useRouterState({ select: (s) => s.location.pathname });
  const { theme, toggle } = useTheme();
  const access = useAccess();
  const displayedGroups = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const module = moduleForPath(item.url);
        return !module || access.can(module.key, "view");
      }),
    }))
    .filter((group) => group.items.length > 0);

  const logout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border/60">
        <div className="flex items-center gap-3 px-2 py-3 group">
          <div className="relative shrink-0">
            <div className="relative w-10 h-10 rounded-xl bg-black flex items-center justify-center overflow-hidden ring-1 ring-white/10 shadow-md transition-all duration-300 group-hover:scale-105 group-hover:shadow-lg">
              <img src={customLogo || logoUrl} alt="Nobre MKT" className="w-8 h-8 object-contain" />
            </div>
          </div>
          {!collapsed && (
            <div className="leading-tight overflow-hidden">
              <div
                className="font-bold tracking-tight text-base truncate"
                style={{
                  background: "var(--gradient-primary)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Nobre MKT
              </div>
              <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-primary/80 font-semibold">
                <span className="inline-block w-1 h-1 rounded-full bg-primary animate-pulse" />
                Premium
              </div>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        {displayedGroups.map((g) => (
          <SidebarGroup key={g.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground/70 px-3">
              {g.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {g.items.map((it) => {
                  const active = current === it.url || current.startsWith(it.url + "/");
                  return (
                    <SidebarMenuItem key={it.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={it.title}
                        className="group/item relative rounded-lg transition-all duration-200 data-[active=true]:bg-sidebar-accent/80 data-[active=true]:shadow-sm data-[active=true]:font-semibold hover:bg-sidebar-accent/50"
                      >
                        <Link
                          to={it.url}
                          className="flex items-center gap-3"
                          data-tour={`menu-${it.url.replace(/\//g, "")}`}
                        >
                          {active && (
                            <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-primary" />
                          )}
                          <it.icon
                            className={`w-4 h-4 shrink-0 transition-colors ${active ? "text-primary" : "text-muted-foreground group-hover/item:text-foreground"}`}
                          />
                          <span className="truncate">{it.title}</span>
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
      <SidebarFooter className="border-t border-sidebar-border/60">
        <SidebarMenu className="gap-0.5">
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={toggle}
              tooltip={theme === "dark" ? "Modo claro" : "Modo escuro"}
              className="rounded-lg transition-all duration-200 hover:bg-sidebar-accent/50"
            >
              {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>{theme === "dark" ? "Modo claro" : "Modo escuro"}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={logout}
              tooltip="Sair"
              className="rounded-lg transition-all duration-200 hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
