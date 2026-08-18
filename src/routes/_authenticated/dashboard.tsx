import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { GoalCelebration } from "@/components/goal-celebration";
import { useAuth } from "@/lib/auth";
import { useMidnightRefresh } from "@/hooks/use-midnight-refresh";
import { formatCurrency, dateKey, monthKey, toDateKey, toMonthKey } from "@/lib/format";
import { isMissingVideoDurationBreakdownColumnError } from "@/lib/supabase-schema";
import {
  calculateVideoPoints,
  normalizeProductionDeliveredAt,
  resolveOrderVideoDurationSeconds,
} from "@/lib/video-production";
import { toast } from "sonner";
import { DollarSign, TrendingUp, Calendar } from "lucide-react";
import { DashboardHero } from "@/components/dashboard/dashboard-hero";
import { DashboardFilters, type DashboardScope } from "@/components/dashboard/dashboard-filters";
import {
  TodayHeroCards,
  ReceivablesCards,
  MainKpiCards,
  ProductionKpiCards,
} from "@/components/dashboard/dashboard-kpi-sections";
import { TopRankingsSection } from "@/components/dashboard/dashboard-top-rankings";
import { InProductionCard } from "@/components/dashboard/dashboard-in-production";
import {
  SalesAndPaymentCharts,
  type ChartTheme,
} from "@/components/dashboard/dashboard-charts-overview";
import { MonthlyChartAndGoals } from "@/components/dashboard/dashboard-monthly";
import { MonthEvolutionChart } from "@/components/dashboard/dashboard-month-evolution";
import { ProductRankingCard } from "@/components/dashboard/dashboard-product-ranking";
import { InvoiceSummaryCards } from "@/components/dashboard/dashboard-invoice-summary";
import { DrillDialog, type DrillState } from "@/components/dashboard/drill-dialog";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const DASHBOARD_SALES_SELECT =
  "id,total_amount,paid_amount,payment_status,created_at,sale_date,seller_id,producer_id,customer_id,service_type_id,package_id,service_quantity,is_payment_link,video_duration_seconds,video_duration_breakdown_seconds";
const DASHBOARD_SALES_SELECT_LEGACY =
  "id,total_amount,paid_amount,payment_status,created_at,sale_date,seller_id,producer_id,customer_id,service_type_id,package_id,service_quantity,is_payment_link,video_duration_seconds";

function startOf(period: "day" | "week" | "month" | "year") {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") {
    const day = d.getDay();
    d.setDate(d.getDate() - day);
  }
  if (period === "month") d.setDate(1);
  if (period === "year") {
    d.setMonth(0);
    d.setDate(1);
  }
  return d.toISOString();
}

// Extrai a duração (em segundos) a partir do nome do card.
// Aceita "2:30", "1:02:30", "150s", "2min", "2min30s" etc. Retorna 0 se nada confiável.
export function parseDuracaoSegundos(name: string): number {
  if (!name) return 0;
  const s = name.toLowerCase();
  const mColon = s.match(/(?<![\d:])(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?(?![\d:])/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }
  const mUnits = s.match(/(\d+)\s*(?:min|m)(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);
  const mSec = s.match(/(\d+)\s*s\b/);
  if (mSec) return Number(mSec[1]);
  return 0;
}

function Dashboard() {
  const navigate = useNavigate();
  // Filtros principais
  const [scope, setScope] = useState<DashboardScope>("day");
  const todayStr = dateKey();
  const yesterdayStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return dateKey(d);
  })();
  const [customFrom, setCustomFrom] = useState<string>(todayStr);
  const [customTo, setCustomTo] = useState<string>(todayStr);
  const { user } = useAuth();
  const [sellerFilter, setSellerFilter] = useState<string>("all");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  // Drill-down: clique em ranking abre lista detalhada
  const [drill, setDrill] = useState<DrillState>(null);
  const qc = useQueryClient();

  // Auto-refresh à meia-noite — zera KPIs do "Hoje" sem reload
  useMidnightRefresh();

  // Tick a cada 60s — vira o dia/semana/mês automaticamente
  const [, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime — recarrega quando vendas / serviços / notas mudam
  useEffect(() => {
    // Throttle invalidations to avoid flooding queries on bursts of changes
    let pendingKeys = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = (key: string) => {
      pendingKeys.add(key);
      if (timer) return;
      timer = setTimeout(() => {
        pendingKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
        pendingKeys.clear();
        timer = null;
      }, 5000);
    };
    const ch = supabase
      .channel("dashboard-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "sales" }, () =>
        schedule("dash-sales"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "service_orders" }, () =>
        schedule("dash-orders"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "invoices" }, () =>
        schedule("dash-invoices"),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "sale_receipts" }, () =>
        schedule("dash-receipts"),
      )
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const sales = useQuery({
    queryKey: ["dash-sales"],
    queryFn: async () => {
      const primaryResult = await supabase.from("sales").select(DASHBOARD_SALES_SELECT);

      if (
        primaryResult.error &&
        isMissingVideoDurationBreakdownColumnError(primaryResult.error)
      ) {
        console.warn(
          "[dashboard] Falling back to legacy sales query because video_duration_breakdown_seconds is missing in remote schema.",
        );
        const legacyResult = await supabase.from("sales").select(DASHBOARD_SALES_SELECT_LEGACY);
        if (legacyResult.error) throw legacyResult.error;
        return (legacyResult.data ?? []) as any[];
      }

      if (primaryResult.error) throw primaryResult.error;
      return (primaryResult.data ?? []) as any[];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const goals = useQuery({
    queryKey: ["dash-goals"],
    queryFn: async () => {
      const { data } = await supabase.from("goals").select("*").is("seller_id", null);
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const orders = useQuery({
    queryKey: ["dash-orders"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select(
          "id,title,column_id,delivered_at,sale_id,service_index,producer_id,created_at,video_duration_seconds,kanban_columns(name,is_done,is_default,sort_order)",
        );
      if (error) {
        toast.error("Erro ao carregar pedidos");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sellers = useQuery({
    queryKey: ["dash-sellers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sellers").select("id,name");
      if (error) {
        toast.error("Erro ao carregar vendedores");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const producers = useQuery({
    queryKey: ["dash-producers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("producers")
        .select("id,name,quality_score,average_delivery_days,active")
        .eq("active", true);
      if (error) {
        toast.error("Erro ao carregar produtores");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });
  const invoices = useQuery({
    queryKey: ["dash-invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id,status,sale_id,amount,issued_at,created_at");
      if (error) {
        toast.error("Erro ao carregar faturas");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const receipts = useQuery({
    queryKey: ["dash-receipts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sale_receipts")
        .select("id,sale_id,amount,paid_at,created_at")
        .order("created_at", { ascending: false })
        .limit(2000);
      if (error) {
        toast.error("Erro ao carregar recebimentos");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
  const serviceTypes = useQuery({
    queryKey: ["dash-service-types"],
    queryFn: async () => {
      const { data, error } = await supabase.from("service_types").select("id,name");
      if (error) {
        toast.error("Erro ao carregar serviços");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
  const packages = useQuery({
    queryKey: ["dash-packages"],
    queryFn: async () => {
      const { data, error } = await supabase.from("packages").select("id,name");
      if (error) {
        toast.error("Erro ao carregar pacotes");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 600_000,
    refetchOnWindowFocus: false,
  });
  const customers = useQuery({
    queryKey: ["dash-customers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("customers").select("id,name");
      if (error) {
        toast.error("Erro ao carregar clientes");
        throw error;
      }
      return data ?? [];
    },
    staleTime: 300_000,
    refetchOnWindowFocus: false,
  });

  const allRaw = sales.data ?? [];

  // Aplica filtros de vendedor + tipo de serviço a TODAS as métricas
  const all = useMemo(() => {
    return allRaw.filter((s) => {
      if (s.is_payment_link) return false;
      if (sellerFilter !== "all" && s.seller_id !== sellerFilter) return false;
      if (serviceFilter !== "all" && s.service_type_id !== serviceFilter) return false;
      return true;
    });
  }, [allRaw, sellerFilter, serviceFilter]);

  const sumIn = (since: string) => {
    const sinceDate = since.slice(0, 10);
    return all
      .filter((s) => (s.sale_date || s.created_at.slice(0, 10)) >= sinceDate)
      .reduce((a, s) => a + Number(s.total_amount), 0);
  };

  const dayTotal = sumIn(startOf("day"));
  const weekTotal = sumIn(startOf("week"));
  const monthTotal = sumIn(startOf("month"));
  const yearTotal = sumIn(startOf("year"));

  const dayCount = all.filter(
    (s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("day").slice(0, 10),
  ).length;
  const weekCount = all.filter(
    (s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("week").slice(0, 10),
  ).length;
  const monthCount = all.filter(
    (s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("month").slice(0, 10),
  ).length;
  const ticketMedio = monthCount ? monthTotal / monthCount : 0;

  // Valores pendentes a receber (parcial + pendente)
  const pendingList = all.filter(
    (s) => s.payment_status === "pago_parcial" || s.payment_status === "pendente",
  );
  const pendingTotal = pendingList.reduce(
    (a, s) => a + (Number(s.total_amount) - Number(s.paid_amount ?? 0)),
    0,
  );
  const pendingCount = pendingList.length;

  const goalFor = (p: string) =>
    Number((goals.data ?? []).find((g) => g.period === p)?.target_amount ?? 0);

  // Escopo principal — dia / semana / mês
  const scopeMap = {
    day: {
      total: dayTotal,
      count: dayCount,
      goal: goalFor("daily"),
      label: "Hoje",
      icon: DollarSign,
      since: startOf("day"),
    },
    week: {
      total: weekTotal,
      count: weekCount,
      goal: goalFor("weekly"),
      label: "Semana",
      icon: Calendar,
      since: startOf("week"),
    },
    month: {
      total: monthTotal,
      count: monthCount,
      goal: goalFor("monthly"),
      label: "Mês",
      icon: TrendingUp,
      since: startOf("month"),
    },
    year: {
      total: yearTotal,
      count: all.filter(
        (s) => (s.sale_date || s.created_at.slice(0, 10)) >= startOf("year").slice(0, 10),
      ).length,
      goal: goalFor("yearly"),
      label: "Ano",
      icon: TrendingUp,
      since: startOf("year"),
    },
  } as const;
  const scopeSince =
    scope === "custom"
      ? customFrom
      : scope === "yesterday"
        ? yesterdayStr
        : scopeMap[scope].since.slice(0, 10);
  const scopeUntil =
    scope === "custom" ? customTo : scope === "yesterday" ? yesterdayStr : "9999-12-31";
  const inScope = (d?: string | null) =>
    !!d && d.slice(0, 10) >= scopeSince && d.slice(0, 10) <= scopeUntil;
  const rangeList =
    scope === "custom" || scope === "yesterday"
      ? all.filter((s) => {
          const d = s.sale_date || s.created_at.slice(0, 10);
          return d >= scopeSince && d <= scopeUntil;
        })
      : [];
  const current =
    scope === "custom"
      ? {
          total: rangeList.reduce((a, s) => a + Number(s.total_amount), 0),
          count: rangeList.length,
          goal: 0,
          label: `${customFrom} → ${customTo}`,
          icon: Calendar,
          since: customFrom + "T00:00:00.000Z",
        }
      : scope === "yesterday"
        ? {
            total: rangeList.reduce((a, s) => a + Number(s.total_amount), 0),
            count: rangeList.length,
            goal: goalFor("daily"),
            label: "Ontem",
            icon: Calendar,
            since: yesterdayStr + "T00:00:00.000Z",
          }
        : scopeMap[scope];
  const dayGoal = goalFor("daily");
  const dayPct = dayGoal ? Math.min(100, Math.round((dayTotal / dayGoal) * 100)) : 0;
  const scopePct = current.goal
    ? Math.min(100, Math.round((current.total / current.goal) * 100))
    : 0;

  // Sinal / Recebimento Pendente / Total — respeitam o filtro de escopo (data/vendedor/serviço)
  const scopeSalesList = useMemo(
    () => all.filter((s) => inScope(s.sale_date || s.created_at)),
    [all, scopeSince, scopeUntil],
  );
  const sinalScope = scopeSalesList.reduce((a, s) => a + Number(s.paid_amount ?? 0), 0);
  const scopeSaleIdSet = useMemo(() => new Set(scopeSalesList.map((s) => s.id)), [scopeSalesList]);
  const saleById = useMemo(() => new Map(all.map((s) => [s.id, s])), [all]);
  const receiptsScope = (receipts.data ?? []).filter((r) => {
    const receiptKey = toDateKey(r.paid_at || r.created_at);
    if (!receiptKey || receiptKey < scopeSince || receiptKey > scopeUntil) return false;
    // Não conta o sinal (recebimento de venda do próprio escopo já entra em Sinal via paid_amount)
    if (scopeSaleIdSet.has(r.sale_id)) return false;
    // Respeita filtros de vendedor/serviço via venda pai
    const sale = saleById.get(r.sale_id);
    if (!sale) return false;
    if (sellerFilter !== "all" && sale.seller_id !== sellerFilter) return false;
    if (serviceFilter !== "all" && sale.service_type_id !== serviceFilter) return false;
    return true;
  });
  const recebPendentesScope = receiptsScope.reduce((a, r) => a + Number(r.amount ?? 0), 0);
  const totalRecebidoScope = sinalScope + recebPendentesScope;
  const scopePeriodLabel =
    scope === "day"
      ? "hoje"
      : scope === "yesterday"
        ? "ontem"
        : scope === "week"
          ? "na semana"
          : scope === "month"
            ? "no mês"
            : scope === "year"
              ? "no ano"
              : `${customFrom} → ${customTo}`;

  const counts = {
    pago_total: all.filter(
      (s) => s.payment_status === "pago_total" && inScope(s.sale_date || s.created_at),
    ).length,
    pago_parcial: all.filter(
      (s) => s.payment_status === "pago_parcial" && inScope(s.sale_date || s.created_at),
    ).length,
    pendente: all.filter(
      (s) => s.payment_status === "pendente" && inScope(s.sale_date || s.created_at),
    ).length,
  };

  // Service Orders por etapa — reflete o Kanban real
  // "A fazer"     = coluna marcada como is_default (primeira coluna do fluxo)
  // "Em produção" = colunas intermediárias (is_done=false e is_default=false), ex.: "Produção", "Alteração a Fazer"
  // "Entregue"    = colunas com is_done=true (Pronto / Entregue / Alteração Pronta)
  const salesById = useMemo(
    () => new Map((sales.data ?? []).map((sale) => [sale.id, sale])),
    [sales.data],
  );
  const ordersList = useMemo(
    () =>
      (orders.data ?? []).map((order) => {
        const sale = order.sale_id ? salesById.get(order.sale_id) : undefined;
        const producerId = order.producer_id ?? sale?.producer_id ?? null;
        return {
          ...order,
          producer_id: producerId,
          delivered_at: normalizeProductionDeliveredAt(
            producerId,
            order.title,
            order.delivered_at,
          ),
        };
      }),
    [orders.data, salesById],
  );
  const resolveDashboardOrderDuration = useCallback(
    (order: any) =>
      resolveOrderVideoDurationSeconds({
        ...order,
        sales: order.sale_id != null ? salesById.get(order.sale_id) ?? null : null,
      }),
    [salesById],
  );
  const ordersTodo = ordersList.filter((o) => o.kanban_columns?.is_default === true).length;
  const ordersInProd = ordersList.filter(
    (o) =>
      o.kanban_columns &&
      o.kanban_columns.is_done === false &&
      o.kanban_columns.is_default !== true,
  ).length;
  const ordersDelivered = ordersList.filter(
    (o) => !!o.delivered_at || o.kanban_columns?.is_done,
  ).length;

  const totalRecordingStats = useMemo(() => {
    const influencers = all.filter((sale) => {
      const st = (serviceTypes.data ?? []).find((x) => x.id === sale.service_type_id);
      if (!st) return false;
      const name = st.name.toLowerCase();
      return name.includes("pamela") || name.includes("ester") || name.includes("influencer");
    });

    const total = influencers.reduce((acc, s) => acc + Number(s.service_quantity || 1), 0);

    // Contar quantos desses serviços (service_orders) já foram entregues
    const saleIds = new Set(influencers.map((s) => s.id));
    const influencerOrders = ordersList.filter((o) => o.sale_id != null && saleIds.has(o.sale_id));
    const delivered = influencerOrders.filter(
      (o) => !!o.delivered_at || o.kanban_columns?.is_done,
    ).length;

    return { total, delivered };
  }, [all, serviceTypes.data, ordersList]);

  // Invoices: emitidas vs aguardando
  const invList = invoices.data ?? [];
  const invIssued = invList.filter((i) => i.status === "emitida" || !!i.issued_at).length;
  const invPending = invList.length - invIssued;

  // Vendas sem nota / com nota (no escopo selecionado)
  const scopeSaleIds = new Set(
    all.filter((s) => inScope(s.sale_date || s.created_at)).map((s) => s.id),
  );
  const salesWithInvoice = new Set(
    invList.filter((i) => i.sale_id && scopeSaleIds.has(i.sale_id)).map((i) => i.sale_id),
  );
  const scopeSalesWithInvoice = salesWithInvoice.size;
  const scopeSalesWithoutInvoice = scopeSaleIds.size - scopeSalesWithInvoice;

  // Ranking vendedores (no escopo)
  const sellerRanking = (sellers.data ?? [])
    .map((s) => {
      const list = all.filter((x) => x.seller_id === s.id && inScope(x.sale_date || x.created_at));
      return {
        id: s.id,
        name: s.name,
        total: list.reduce((a, x) => a + Number(x.total_amount), 0),
        qtd: list.length,
      };
    })
    .filter((s) => s.qtd > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // Ranking produtores — contagem EXATA pelo estado atual do Kanban.
  // "Pronto" = card está hoje em uma coluna marcada como concluída (is_done).
  // "Em produção" = card está hoje em uma coluna não concluída.
  // Minutagem é extraída do próprio nome do card (ex.: "2:30", "1min30s").
  const producerRanking = (producers.data ?? [])
    .map((p) => {
      const ofProducer = ordersList.filter((o) => o.producer_id === p.id);
      // Valor total produzido no MÊS corrente (zera na virada do mês)
      const monthISOStart = startOf("month").slice(0, 10);
      const saleById = new Map(all.map((s) => [s.id, s]));
      const valorTotal = ofProducer.reduce((acc, o) => {
        if (!(o.delivered_at || o.kanban_columns?.is_done)) return acc;
        const d = toDateKey(o.delivered_at);
        if (!d || d < monthISOStart) return acc;
        const sale = o.sale_id != null ? saleById.get(o.sale_id) : undefined;
        if (!sale) return acc;
        const qty = Math.max(Number(sale.service_quantity || 1), 1);
        return acc + Number(sale.total_amount || 0) / qty;
      }, 0);
      // "Pronto/entregue" no período selecionado: filtra por delivered_at dentro do escopo
      const prontoList = ofProducer.filter((o) => {
        if (o.kanban_columns?.is_done !== true) return false;
        const d = toDateKey(o.delivered_at);
        return d && d >= scopeSince && d <= scopeUntil;
      });
      // Entregues no DIA (hoje) — usado SEMPRE para o ranking, independente do filtro de escopo
      const todayISO = startOf("day").slice(0, 10);
      const entreguesHoje = ofProducer.filter((o) => {
        if (o.kanban_columns?.is_done !== true) return false;
        const d = toDateKey(o.delivered_at);
        return d === todayISO;
      }).length;
      // Entregues no MÊS corrente — mostrado como destaque/subtítulo
      const monthISO = startOf("month").slice(0, 10);
      const entreguesMes = ofProducer.filter((o) => {
        if (o.kanban_columns?.is_done !== true) return false;
        const d = toDateKey(o.delivered_at);
        return d >= monthISO;
      }).length;
      // Entregues no HISTÓRICO (todos os cards em colunas concluídas) — bate com o Kanban
      const entreguesTotal = ofProducer.filter((o) => o.kanban_columns?.is_done === true).length;
      // Em produção = colunas intermediárias do Kanban (exclui "Serviços a fazer" e colunas concluídas)
      const emProducaoList = ofProducer.filter(
        (o) =>
          o.kanban_columns &&
          o.kanban_columns.is_done === false &&
          o.kanban_columns.is_default !== true,
      );
      const entregues = prontoList.length;
      const emProducao = emProducaoList.length;
      const segundosProntos = prontoList.reduce(
        (acc, o) => acc + resolveDashboardOrderDuration(o),
        0,
      );
      return {
        id: p.id,
        name: p.name,
        entregues,
        entreguesHoje,
        entreguesMes,
        entreguesTotal,
        emProducao,
        segundosProntos,
        pontosProntos: calculateVideoPoints(segundosProntos),
        valorTotal,
        qtd: entregues + emProducao,
      };
    })
    .filter((p) => p.entreguesMes > 0 || p.entregues > 0 || p.emProducao > 0)
    .sort(
      (a, b) =>
        b.entreguesHoje - a.entreguesHoje ||
        b.entreguesMes - a.entreguesMes ||
        b.segundosProntos - a.segundosProntos ||
        b.qtd - a.qtd,
    )
    .slice(0, 5);

  // Ranking de "Em Produção" por produtor — reflete o Kanban real (estado atual)
  const inProductionRanking = (producers.data ?? [])
    .map((p) => {
      const emProducao = ordersList.filter(
        (o) =>
          o.producer_id === p.id &&
          o.kanban_columns &&
          o.kanban_columns.is_done === false &&
          o.kanban_columns.is_default !== true,
      ).length;
      return { id: p.id, name: p.name, emProducao };
    })
    .filter((p) => p.emProducao > 0)
    .sort((a, b) => b.emProducao - a.emProducao);
  const totalInProduction = inProductionRanking.reduce((a, p) => a + p.emProducao, 0);

  // Evolução diária dos vídeos entregues no mês corrente (cumulativo + diário)
  const monthDeliverySeries = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const today = now.getDate();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = new Map<number, number>();
    for (const o of ordersList) {
      if (!o.delivered_at) continue;
      const deliveryKey = toDateKey(o.delivered_at);
      const [deliveryYear, deliveryMonth, day] = deliveryKey.split("-").map(Number);
      if (deliveryYear !== year || deliveryMonth - 1 !== month) continue;
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
    }
    let acc = 0;
    const series: { dia: string; dayNum: number; entregues: number; total: number }[] = [];
    for (let i = 1; i <= daysInMonth; i++) {
      const entregues = byDay.get(i) ?? 0;
      acc += entregues;
      series.push({
        dia: String(i).padStart(2, "0"),
        dayNum: i,
        entregues,
        // Para dias futuros, deixa o total cumulativo como null para não desenhar a linha à frente
        total: i <= today ? acc : (null as unknown as number),
      });
    }
    return series;
  }, [ordersList]);
  const monthDeliveredTotal = monthDeliverySeries.reduce((a, d) => a + d.entregues, 0);

  // Minutagem entregue: soma a duração (sales.video_duration_seconds) dos service_orders
  // que já têm delivered_at, agrupando por hoje e pelo mês corrente.
  const minutagemStats = useMemo(() => {
    const todayKey = startOf("day").slice(0, 10);
    const monthKey = startOf("month").slice(0, 10);
    let hojeSegs = 0;
    let hojeQtd = 0;
    let mesSegs = 0;
    let mesQtd = 0;
    for (const o of ordersList) {
      if (!o.delivered_at) continue;
      // Prefere a minutagem específica do card; cai para a da venda.
      const dur = resolveDashboardOrderDuration(o);
      if (dur <= 0) continue;
      const d = toDateKey(o.delivered_at);
      if (d >= monthKey) {
        mesSegs += dur;
        mesQtd += 1;
      }
      if (d === todayKey) {
        hojeSegs += dur;
        hojeQtd += 1;
      }
    }
    return { hojeSegs, hojeQtd, mesSegs, mesQtd };
  }, [ordersList, resolveDashboardOrderDuration]);

  // Produtos / serviços mais vendidos (no escopo) — combina service_types + packages
  const productRanking = useMemo(() => {
    const map = new Map<string, { name: string; total: number; qtd: number }>();
    const stById = new Map((serviceTypes.data ?? []).map((s) => [s.id, s.name]));
    const pkById = new Map((packages.data ?? []).map((p) => [p.id, p.name]));
    for (const s of all) {
      if (!inScope(s.sale_date || s.created_at)) continue;
      const name = s.package_id
        ? (pkById.get(s.package_id) ?? "Pacote")
        : (stById.get(s.service_type_id ?? "") ?? "Outro");
      const cur = map.get(name) ?? { name, total: 0, qtd: 0 };
      cur.total += Number(s.total_amount);
      cur.qtd += 1;
      map.set(name, cur);
    }
    return Array.from(map.values())
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);
  }, [all, serviceTypes.data, packages.data, scopeSince]);

  const monthChart = Array.from({ length: 12 }, (_, i) => {
    const ref = new Date();
    const d = new Date(ref.getFullYear(), ref.getMonth() - 11 + i, 1);
    const month = d.getMonth();
    const year = d.getFullYear();
    // Comparação por texto "YYYY-MM" evita deslocamento de fuso horário
    const key = monthKey(d);
    const total = all
      .filter((s) => toMonthKey(s.sale_date || s.created_at) === key)
      .reduce((a, s) => a + Number(s.total_amount), 0);
    return {
      mes: ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][
        month
      ],
      total,
    };
  });

  // Últimos 30 dias (Area)
  const last30 = useMemo(() => {
    const days: { dia: string; total: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = dateKey(d);
      const total = all
        .filter((s) => toDateKey(s.sale_date || s.created_at) === key)
        .reduce((a, s) => a + Number(s.total_amount), 0);
      days.push({
        dia: `${d.getDate().toString().padStart(2, "0")}/${(d.getMonth() + 1).toString().padStart(2, "0")}`,
        total,
      });
    }
    return days;
  }, [all]);

  // Pagamento — Pie
  const paymentPie = [
    { name: "Pago total", value: counts.pago_total, color: "var(--success)" },
    { name: "Pago parcial", value: counts.pago_parcial, color: "var(--warning)" },
    { name: "Pendente", value: counts.pendente, color: "var(--destructive)" },
  ];

  const chartTheme: ChartTheme = {
    grid: "color-mix(in oklab, var(--foreground) 12%, transparent)",
    axis: "color-mix(in oklab, var(--foreground) 55%, transparent)",
    tooltipBg: "var(--popover)",
    tooltipBorder: "var(--border)",
    primary: "var(--primary)",
    primaryGlow: "var(--primary-glow)",
  };

  const goalRows = [
    { label: "Diária", v: dayTotal, g: goalFor("daily") },
    { label: "Semanal", v: weekTotal, g: goalFor("weekly") },
    { label: "Mensal", v: monthTotal, g: goalFor("monthly") },
    { label: "Anual", v: yearTotal, g: goalFor("yearly") },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <GoalCelebration
        items={[
          {
            key: "daily",
            current: dayTotal,
            goal: goalFor("daily"),
            label: "Meta diária",
            periodStamp: startOf("day").slice(0, 10),
          },
          {
            key: "weekly",
            current: weekTotal,
            goal: goalFor("weekly"),
            label: "Meta semanal",
            periodStamp: startOf("week").slice(0, 10),
          },
          {
            key: "monthly",
            current: monthTotal,
            goal: goalFor("monthly"),
            label: "Meta mensal",
            periodStamp: startOf("month").slice(0, 7),
          },
          {
            key: "yearly",
            current: yearTotal,
            goal: goalFor("yearly"),
            label: "Meta anual",
            periodStamp: startOf("year").slice(0, 4),
          },
        ]}
      />

      <DashboardHero />

      <DashboardFilters
        scope={scope}
        onScopeChange={setScope}
        customFrom={customFrom}
        onCustomFromChange={setCustomFrom}
        customTo={customTo}
        onCustomToChange={setCustomTo}
        sellerFilter={sellerFilter}
        onSellerFilterChange={setSellerFilter}
        serviceFilter={serviceFilter}
        onServiceFilterChange={setServiceFilter}
        sellers={sellers.data ?? []}
        serviceTypes={serviceTypes.data ?? []}
        showClear={sellerFilter !== "all" || serviceFilter !== "all" || scope !== "day"}
        onClear={() => {
          setSellerFilter("all");
          setServiceFilter("all");
          setScope("day");
        }}
        visibleCount={all.length}
        totalCount={allRaw.length}
      />

      <TodayHeroCards
        current={current}
        scopePct={scopePct}
        weekTotal={weekTotal}
        weekCount={weekCount}
        weekGoal={goalFor("weekly")}
      />

      <ReceivablesCards
        scopePeriodLabel={scopePeriodLabel}
        sinalScope={sinalScope}
        scopeSalesCount={scopeSalesList.length}
        recebPendentesScope={recebPendentesScope}
        receiptsScopeCount={receiptsScope.length}
        totalRecebidoScope={totalRecebidoScope}
      />

      <MainKpiCards
        weekTotal={weekTotal}
        weekCount={weekCount}
        monthTotal={monthTotal}
        monthCount={monthCount}
        ticketMedio={ticketMedio}
        yearTotal={yearTotal}
        pendingTotal={pendingTotal}
        pendingCount={pendingCount}
      />

      <ProductionKpiCards
        ordersTodo={ordersTodo}
        ordersInProd={ordersInProd}
        ordersDelivered={ordersDelivered}
        recordingDelivered={totalRecordingStats.delivered}
        recordingTotal={totalRecordingStats.total}
        invIssued={invIssued}
        invTotal={invList.length}
        invPending={invPending}
        onNavigateToKanban={() => navigate({ to: "/kanban", search: { card: undefined } })}
      />

      <TopRankingsSection
        currentLabel={current.label}
        sellerRanking={sellerRanking}
        producerRanking={producerRanking}
        onSelectSeller={(id, label) => setDrill({ kind: "seller", id, label })}
        onSelectProducer={(id, label) => setDrill({ kind: "producer", id, label })}
      />

      <InProductionCard
        inProductionRanking={inProductionRanking}
        totalInProduction={totalInProduction}
        onSelectProducer={(id, label) => setDrill({ kind: "producer", id, label })}
      />

      <SalesAndPaymentCharts last30={last30} paymentPie={paymentPie} chartTheme={chartTheme} />

      <MonthlyChartAndGoals monthChart={monthChart} chartTheme={chartTheme} goalRows={goalRows} />

      <MonthEvolutionChart
        monthDeliverySeries={monthDeliverySeries}
        monthDeliveredTotal={monthDeliveredTotal}
        chartTheme={chartTheme}
      />

      <ProductRankingCard
        currentLabel={current.label}
        productRanking={productRanking}
        chartTheme={chartTheme}
        onSelectProduct={(name) => setDrill({ kind: "product", name, label: name })}
      />

      <InvoiceSummaryCards
        currentLabel={current.label}
        scopeSalesWithInvoice={scopeSalesWithInvoice}
        scopeSalesWithoutInvoice={scopeSalesWithoutInvoice}
        pendingPaymentsCount={counts.pendente}
      />

      {/* Drill-down dialog */}
      <DrillDialog
        drill={drill}
        onClose={() => setDrill(null)}
        sales={all}
        scopeSince={scopeSince}
        scopeLabel={current.label}
        customers={customers.data ?? []}
        sellers={sellers.data ?? []}
        producers={producers.data ?? []}
        serviceTypes={serviceTypes.data ?? []}
        packages={packages.data ?? []}
      />
    </div>
  );
}
