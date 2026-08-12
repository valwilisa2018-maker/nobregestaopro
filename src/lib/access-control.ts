export type PermissionAction = "view" | "create" | "edit" | "delete";
export type ModulePermission = Record<PermissionAction, boolean>;
export type PermissionMap = Record<string, ModulePermission>;

export type MenuModule = {
  key: string;
  title: string;
  url: string;
  group: "Operação" | "Cadastros" | "Financeiro" | "Administração";
  actions: PermissionAction[];
};

// Fonte única para menu, convites e proteção de páginas.
export const MENU_MODULES: MenuModule[] = [
  { key: "dashboard", title: "Dashboard", url: "/dashboard", group: "Operação", actions: ["view"] },
  {
    key: "sales",
    title: "Vendas",
    url: "/sales",
    group: "Operação",
    actions: ["view", "create", "edit", "delete"],
  },
  { key: "telao", title: "Telão", url: "/telao", group: "Operação", actions: ["view"] },
  {
    key: "kanban",
    title: "Produção (Kanban)",
    url: "/kanban",
    group: "Operação",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "services_todo",
    title: "Serviços a Fazer",
    url: "/services-todo",
    group: "Operação",
    actions: ["view", "edit"],
  },
  {
    key: "files",
    title: "Pastas e Arquivos",
    url: "/pastas-arquivos",
    group: "Operação",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "chat",
    title: "Chat Organizador",
    url: "/chat-organizador",
    group: "Operação",
    actions: ["view", "create"],
  },
  {
    key: "goals",
    title: "Operação Metas",
    url: "/operacao-meta",
    group: "Operação",
    actions: ["view", "edit"],
  },
  {
    key: "customers",
    title: "Clientes",
    url: "/customers",
    group: "Cadastros",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "sellers",
    title: "Vendedores",
    url: "/sellers",
    group: "Cadastros",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "producers",
    title: "Produtores",
    url: "/producers",
    group: "Cadastros",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "payments",
    title: "Pagamentos Cartão/PIX",
    url: "/pagarme-history",
    group: "Financeiro",
    actions: ["view"],
  },
  {
    key: "payment_link",
    title: "Gerar Pagamento",
    url: "/payment-link",
    group: "Financeiro",
    actions: ["view", "create"],
  },
  {
    key: "finance",
    title: "Financeiro",
    url: "/finance",
    group: "Financeiro",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "pending_payments",
    title: "Valores Pendentes",
    url: "/pending-payments",
    group: "Financeiro",
    actions: ["view", "edit"],
  },
  {
    key: "invoices",
    title: "Notas Fiscais",
    url: "/invoices",
    group: "Financeiro",
    actions: ["view", "create", "edit", "delete"],
  },
  {
    key: "commissions",
    title: "Comissões",
    url: "/commissions",
    group: "Financeiro",
    actions: ["view", "edit"],
  },
  {
    key: "plans",
    title: "Planos & Assinatura",
    url: "/planos",
    group: "Administração",
    actions: ["view", "edit"],
  },
  {
    key: "backup",
    title: "Backup",
    url: "/backup",
    group: "Administração",
    actions: ["view", "create"],
  },
  {
    key: "whatsapp",
    title: "Conectar WhatsApp",
    url: "/whatsapp",
    group: "Administração",
    actions: ["view", "edit"],
  },
  {
    key: "audit",
    title: "Auditoria",
    url: "/auditoria",
    group: "Administração",
    actions: ["view"],
  },
  {
    key: "white_label",
    title: "Personalização",
    url: "/white-label",
    group: "Administração",
    actions: ["view", "edit"],
  },
  {
    key: "settings",
    title: "Configurações",
    url: "/admin",
    group: "Administração",
    actions: ["view", "edit"],
  },
  {
    key: "users",
    title: "Usuários e Permissões",
    url: "/usuarios",
    group: "Administração",
    actions: ["view", "create", "edit"],
  },
];

export const emptyPermission = (): ModulePermission => ({
  view: false,
  create: false,
  edit: false,
  delete: false,
});

export function normalizePermissions(value: unknown): PermissionMap {
  const source =
    value && typeof value === "object" ? (value as Record<string, Partial<ModulePermission>>) : {};
  return Object.fromEntries(
    MENU_MODULES.map((module) => {
      const permission = source[module.key] ?? {};
      return [
        module.key,
        {
          view: Boolean(permission.view),
          create: Boolean(permission.create),
          edit: Boolean(permission.edit),
          delete: Boolean(permission.delete),
        },
      ];
    }),
  );
}

export function moduleForPath(pathname: string) {
  return [...MENU_MODULES]
    .sort((a, b) => b.url.length - a.url.length)
    .find((module) => pathname === module.url || pathname.startsWith(`${module.url}/`));
}
