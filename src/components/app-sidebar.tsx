import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Bot, BookOpen, Workflow,
  MessageCircle, Brain, Users, MessagesSquare, History, ScrollText,
  Settings, UserCog, ShieldCheck, DollarSign, Palette, Contact2, Send, Puzzle, LogOut, Timer,
  LineChart, Activity, CreditCard, Shield, User, Crown, Building2, Plug, CalendarDays, Bug, Coins, Package, Kanban,
  Sun, Moon, LifeBuoy, AlertTriangle,
} from "lucide-react";
import {
  Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel,
  SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader, SidebarFooter, useSidebar,
} from "@/components/ui/sidebar";
import { supabase } from "@/integrations/supabase/client";
import logoAsset from "@/assets/agent-ia-logo.png.asset.json";
import { useTheme } from "@/hooks/use-theme";

const groups = [
  {
    label: "Workspace",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "Agentes", url: "/agents", icon: Bot },
      { title: "Agenda", url: "/calendar", icon: CalendarDays },
      { title: "Mensagens", url: "/messages", icon: MessagesSquare },
      { title: "Base de Conhecimento", url: "/knowledge", icon: BookOpen },
    ],
  },
  {
    label: "Automação",
    items: [
      { title: "Follow-up", url: "/followups", icon: Timer },
      { title: "Contatos", url: "/contacts", icon: Contact2 },
      { title: "Pipeline CRM", url: "/pipeline", icon: Kanban },
      { title: "Workflows", url: "/flows", icon: Workflow },
      { title: "Disparo em Massa", url: "/broadcasts", icon: Send },
      { title: "Conexão WhatsApp", url: "/whatsapp", icon: MessageCircle },
      { title: "Meta API Oficial", url: "/meta-api", icon: MessageCircle },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Prompts", url: "/prompt", icon: Brain },
      { title: "Clientes", url: "/clients", icon: Users },
      { title: "Histórico", url: "/history", icon: History },
      { title: "Logs", url: "/logs", icon: ScrollText },
      { title: "Debug de Fluxo", url: "/flow-debug", icon: Bug },
    ],
  },
  {
    label: "Financeiro",
    items: [
      { title: "Meu Plano", url: "/billing", icon: CreditCard },
      { title: "Créditos IA", url: "/credits", icon: Coins },
    ],
  },
  {
    label: "Conta",
    items: [
      { title: "Suporte", url: "/support", icon: LifeBuoy },
      { title: "Configurações", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { theme, toggle } = useTheme();
  const [isMaster, setIsMaster] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase.rpc("has_role", { _user_id: user.id, _role: "master" });
      if (!cancelled) setIsMaster(!!data);
    })();
    return () => { cancelled = true; };
  }, []);

  const allGroups = groups;

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      {/* Ambient premium glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 opacity-60"
        style={{
          background:
            "radial-gradient(600px 200px at 0% 0%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 60%), radial-gradient(400px 200px at 0% 100%, color-mix(in oklab, var(--primary) 12%, transparent), transparent 60%)",
        }}
      />
      <SidebarHeader className="p-4 border-b border-sidebar-border/60">
        <motion.div
          className="flex items-center gap-2.5"
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="relative">
            <img src={logoAsset.url} alt="Agent IA" className="h-9 w-9 rounded-xl object-cover ring-1 ring-primary/40" />
            <motion.div
              className="absolute inset-0 rounded-xl -z-10"
              style={{ background: "var(--gradient-primary)" }}
              animate={{ opacity: [0.35, 0.7, 0.35], scale: [1, 1.08, 1] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
          {!collapsed && (
            <div className="flex flex-col leading-tight min-w-0">
              <motion.span
                className="font-black tracking-tight bg-clip-text text-transparent bg-[length:200%_100%]"
                style={{ backgroundImage: "var(--gradient-primary)" }}
                animate={{ backgroundPositionX: ["0%", "100%", "0%"] }}
                transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
              >
                AGENT IA
              </motion.span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-widest">Enterprise</span>
            </div>
          )}
        </motion.div>
      </SidebarHeader>
      <SidebarContent>
        {allGroups.map((g, gi) => (
          <SidebarGroup key={g.label}>
            {!collapsed && (
              <SidebarGroupLabel className="relative flex items-center gap-2 uppercase tracking-[0.18em] text-[10px] text-muted-foreground/70">
                <motion.span
                  className="h-px flex-1"
                  style={{
                    background:
                      "linear-gradient(90deg, transparent, color-mix(in oklab, var(--primary) 40%, transparent), transparent)",
                  }}
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.6, delay: 0.1 + gi * 0.05 }}
                />
                <span>{g.label}</span>
                <span className="h-px flex-1 bg-sidebar-border/40" />
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {g.items.map((item, ii) => {
                  const active = pathname === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="group relative overflow-hidden data-[active=true]:bg-transparent"
                      >
                        <Link to={item.url} className="relative flex items-center gap-2.5">
                          <AnimatePresence>
                            {active && (
                              <motion.span
                                layoutId="sidebar-active-pill"
                                className="absolute inset-0 -z-10 rounded-md"
                                style={{
                                  background:
                                    "linear-gradient(90deg, color-mix(in oklab, var(--primary) 22%, transparent), color-mix(in oklab, var(--primary) 6%, transparent))",
                                  boxShadow:
                                    "inset 0 0 0 1px color-mix(in oklab, var(--primary) 35%, transparent)",
                                }}
                                transition={{ type: "spring", stiffness: 380, damping: 32 }}
                              />
                            )}
                          </AnimatePresence>
                          {active && (
                            <motion.span
                              layoutId="sidebar-active-bar"
                              className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full"
                              style={{ background: "var(--gradient-primary)" }}
                              transition={{ type: "spring", stiffness: 380, damping: 32 }}
                            />
                          )}
                          <motion.span
                            className="pointer-events-none absolute inset-0 -z-10 opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{
                              background:
                                "radial-gradient(120px 40px at var(--x,50%) 50%, color-mix(in oklab, var(--primary) 18%, transparent), transparent 70%)",
                            }}
                          />
                          <motion.span
                            initial={{ opacity: 0, x: -6 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ duration: 0.25, delay: 0.03 * ii }}
                            className={`flex items-center justify-center transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3 ${active ? "text-primary" : "text-sidebar-foreground/80"}`}
                          >
                            <item.icon className="h-4 w-4" />
                          </motion.span>
                          {!collapsed && (
                            <motion.span
                              initial={{ opacity: 0, x: -4 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ duration: 0.25, delay: 0.04 * ii }}
                              className={`truncate ${active ? "font-medium text-foreground" : ""}`}
                            >
                              {item.title}
                            </motion.span>
                          )}
                          {active && !collapsed && (
                            <motion.span
                              layoutId="sidebar-active-dot"
                              className="ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]"
                            />
                          )}
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
      <SidebarFooter className="p-2">
        {isMaster && (
          <SidebarMenuButton asChild tooltip="Painel Admin Master" className="text-amber-500 hover:text-amber-500">
            <Link to="/master" className="flex items-center gap-2">
              <Crown className="h-4 w-4" />
              {!collapsed && <span>Painel Master</span>}
            </Link>
          </SidebarMenuButton>
        )}
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