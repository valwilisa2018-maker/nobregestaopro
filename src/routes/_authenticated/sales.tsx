import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, Component, type ErrorInfo, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  activeSellersQuery,
  activeProducersQuery,
  activeServiceTypesQuery,
  activePackagesQuery,
} from "@/lib/queries/lookups";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatVideoDuration, dateKey, toDateKey } from "@/lib/format";
import { isValidVideoDuration, sumVideoDurations } from "@/lib/video-production";
import { createPaymentLink } from "@/lib/pagarme.functions";
import { autoLinkFolderFromUrl } from "@/lib/project-folders";
import { SalesHeroSection } from "@/components/sales/SalesHeroSection";
import { SalesFiltersBar } from "@/components/sales/SalesFiltersBar";
import { SalesTableView } from "@/components/sales/SalesTableView";
import { SalesCardView } from "@/components/sales/SalesCardView";
import { EditSaleDialog } from "@/components/sales/EditSaleDialog";
import { PaymentLinkDialog } from "@/components/sales/PaymentLinkDialog";
import type { EditingSale, SaleFormState, SaleRecord } from "@/components/sales/types";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesRouteBoundary,
  errorComponent: ({ error, reset }) => {
    // Log to system_logs for post-mortem so we can inspect what actually failed.
    if (typeof window !== "undefined") {
      try {
        logger.error(`Sales route crashed: ${error?.message ?? "unknown"}`, {
          context: "sales/route-error",
          details: { message: error?.message, stack: (error as any)?.stack },
          silent: true,
        });
      } catch {
        /* noop */
      }
    }
    return (
      <div className="max-w-xl mx-auto mt-10 p-6 rounded-lg border border-destructive/30 bg-destructive/5 text-sm space-y-3">
        <h2 className="text-lg font-semibold text-destructive">Erro ao abrir a página de Vendas</h2>
        <p className="text-muted-foreground">
          Tente recarregar. Se persistir, envie o texto abaixo.
        </p>
        <pre className="max-h-48 overflow-auto rounded bg-muted p-3 text-xs whitespace-pre-wrap break-words">
          {error?.message ?? "Erro desconhecido"}
        </pre>
        <div className="flex gap-2">
          <button
            onClick={() => reset()}
            className="rounded-md bg-primary px-4 py-2 text-primary-foreground text-sm"
          >
            Tentar novamente
          </button>
          <a href="/" className="rounded-md border px-4 py-2 text-sm">
            Ir para início
          </a>
        </div>
      </div>
    );
  },
});

type SalesBoundaryState = { key: number; error: Error | null };

function isRecoverableDomError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return (
    message.includes("Failed to execute 'removeChild'") ||
    message.includes("Failed to execute 'insertBefore'") ||
    message.includes("The node to be removed is not a child of this node")
  );
}

class SalesDomBoundary extends Component<{ children: ReactNode }, SalesBoundaryState> {
  state: SalesBoundaryState = { key: 0, error: null };

  static getDerivedStateFromError(error: Error): Partial<SalesBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger
      .error(`Sales UI crashed: ${error.message}`, {
        context: "sales/ui-boundary",
        details: {
          message: error.message,
          stack: error.stack,
          componentStack: errorInfo.componentStack,
        },
        silent: true,
      })
      .catch(() => {});

    if (isRecoverableDomError(error)) {
      window.setTimeout(() => {
        this.setState((state) => ({ key: state.key + 1, error: null }));
      }, 0);
    }
  }

  render() {
    if (this.state.error) {
      if (isRecoverableDomError(this.state.error)) {
        return (
          <div className="rounded-lg border border-border bg-card p-6 text-sm text-muted-foreground">
            Reabrindo a área de vendas com segurança...
          </div>
        );
      }
      throw this.state.error;
    }

    return <div key={this.state.key}>{this.props.children}</div>;
  }
}

function SalesRouteBoundary() {
  return (
    <SalesDomBoundary>
      <SalesPage />
    </SalesDomBoundary>
  );
}

// Detecta se o tipo de serviço selecionado é vídeo (qualquer nome contendo
// "video" / "vídeo") OU se a venda é de um pacote (pacotes são compostos
// por vídeos). Define se o campo "Minutagem" é obrigatório.
function isVideoService(serviceTypeName?: string, hasPackage?: boolean) {
  if (hasPackage) return true;
  const n = (serviceTypeName ?? "").toLowerCase();
  if (n.includes("video") || n.includes("vídeo")) return true;
  // Outros formatos de vídeo (sem a palavra "vídeo" no nome)
  const videoKeywords = [
    "influencer",
    "pamela",
    "pâmela",
    "ester",
    "videoflow",
    "pixar",
    "pixer",
    "3d",
    "whiteboard",
    "realista",
    "explainer",
    "anime",
    "motion",
    "animacao",
    "animação",
  ];
  return videoKeywords.some((k) => n.includes(k));
}

function optionText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function toCents(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

const DEFAULT_VIDEO_DURATION = "30";

function clampServiceQuantity(value: unknown): number {
  const quantity = Number(value ?? 1);
  if (!Number.isFinite(quantity) || quantity < 1) return 1;
  return Math.max(1, Math.trunc(quantity));
}

function normalizeDurationValue(value: unknown): string {
  const seconds = Number(value ?? 0);
  return isValidVideoDuration(seconds) ? String(seconds) : "";
}

function resizeDurationArray(
  values: Array<unknown> | null | undefined,
  quantity: number,
  fillValue = "",
): string[] {
  const normalizedFill = normalizeDurationValue(fillValue);
  const next = Array.isArray(values)
    ? values.slice(0, quantity).map((value) => normalizeDurationValue(value))
    : [];

  while (next.length < quantity) next.push(normalizedFill);
  return next.slice(0, quantity);
}

function hydrateDurationArray(
  values: Array<unknown> | null | undefined,
  quantity: number,
  fillValue = "",
): string[] {
  const normalizedFill = normalizeDurationValue(fillValue);
  return resizeDurationArray(values, quantity, fillValue).map((value) => value || normalizedFill);
}

function totalDurationFromValues(values: Array<unknown> | null | undefined): number {
  return sumVideoDurations((values ?? []).map((value) => Number(value || 0)));
}

function hasAnyDurationValue(values: Array<unknown> | null | undefined): boolean {
  return (values ?? []).some((value) => !!normalizeDurationValue(value));
}

function hasCompleteDurationArray(quantity: number, values: Array<unknown> | null | undefined): boolean {
  return Array.from({ length: quantity }, (_, index) => normalizeDurationValue(values?.[index])).every(Boolean);
}

export { formatVideoDuration } from "@/lib/format";

function SalesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<EditingSale | null>(null);
  const [viewMode, setViewMode] = useState<"table" | "card">("table");
  const [editSaving, setEditSaving] = useState(false);
  const [paymentLinkData, setPaymentLinkData] = useState<{ url: string; id: string } | null>(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);

  // ----- Filters -----
  const [fSearch, setFSearch] = useState("");
  const [fSeller, setFSeller] = useState<string>("all");
  const [fProducer, setFProducer] = useState<string>("all");
  const [fService, setFService] = useState<string>("all");
  const [fYear, setFYear] = useState<string>("all");
  const [fMonth, setFMonth] = useState<string>("all");
  const [fFrom, setFFrom] = useState<string>("");
  const [fTo, setFTo] = useState<string>("");

  const {
    data: salesList,
    isLoading: loadingSales,
    error: salesError,
    refetch,
  } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      // Tentamos o select completo
      const { data, error } = await supabase
        .from("sales")
        .select(
          "*, customers!inner(name,company,phone,email,document), sellers(name), producers(name), service_types(name), sale_receipts(*)",
        )
        .order("sale_date", { ascending: false });

      if (error) {
        console.error("Supabase error fetching sales:", error);
        // Fallback: tenta sem o join restritivo (pode ser problema de dado órfão)
        const { data: fb, error: fbe } = await supabase
          .from("sales")
          .select(
            "*, customers(name,company,phone,email,document), sellers(name), producers(name), service_types(name), sale_receipts(*)",
          )
          .order("sale_date", { ascending: false });

        if (fbe) {
          console.error("Fallback error:", fbe);
          throw fbe;
        }
        return fb ?? [];
      }
      return data ?? [];
    },
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  const totalVendasHoje = useMemo(() => {
    const list = (salesList as any[]) ?? [];
    const todayStr = dateKey();
    return list.reduce((sum, s: any) => {
      const sd = toDateKey(s?.sale_date);
      return sd === todayStr ? sum + Number(s?.total_amount ?? 0) : sum;
    }, 0);
  }, [salesList]);

  const sellers = useQuery(activeSellersQuery());
  const producers = useQuery(activeProducersQuery());
  const serviceTypes = useQuery(activeServiceTypesQuery());
  const packages = useQuery(activePackagesQuery());

  const filteredSales = useMemo(() => {
    const list = salesList ?? [];
    const term = fSearch.trim().toLowerCase();
    return list.filter((s: any) => {
      if (fSeller !== "all" && s.seller_id !== fSeller) return false;
      if (fProducer !== "all" && s.producer_id !== fProducer) return false;
      if (fService !== "all" && s.service_type_id !== fService) return false;
      const sd = toDateKey(s.sale_date);
      if (sd) {
        const [sy, sm] = sd.split("-");
        if (fYear !== "all" && sy !== fYear) return false;
        if (fMonth !== "all" && String(Number(sm)) !== fMonth) return false;
        if (fFrom && s.sale_date < fFrom) return false;
        if (fTo && s.sale_date > fTo + "T23:59:59") return false;
      }
      if (term) {
        const hay = [
          s.customers?.name,
          s.customers?.company,
          s.service_types?.name,
          s.sellers?.name,
          s.producers?.name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [salesList, fSearch, fSeller, fProducer, fService, fYear, fMonth, fFrom, fTo]);

  const yearOptions = useMemo(() => {
    const ys = new Set<string>();
    (salesList ?? []).forEach((s: any) => {
      if (s.sale_date) ys.add(String(s.sale_date).slice(0, 4));
    });
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [salesList]);

  const clearFilters = () => {
    setFSearch("");
    setFSeller("all");
    setFProducer("all");
    setFService("all");
    setFYear("all");
    setFMonth("all");
    setFFrom("");
    setFTo("");
  };
  const hasFilters = !!(
    fSearch ||
    fSeller !== "all" ||
    fProducer !== "all" ||
    fService !== "all" ||
    fYear !== "all" ||
    fMonth !== "all" ||
    fFrom ||
    fTo
  );

  const handleGenerateLink = async (sale: any) => {
    setIsGeneratingLink(true);
    try {
      const res = await createPaymentLink({
        data: {
          name: `Venda ${sale.customers?.name}`,
          amount: Math.round(Number(sale.total_amount) * 100),
          installments: 12,
          methods: ["credit_card", "pix"],
          saleId: sale.id,
        },
      });

      if (res.ok) {
        setPaymentLinkData({ url: res.url, id: res.id || "" });
        toast.success("Link de pagamento gerado!");
        qc.invalidateQueries({ queryKey: ["sales-list"] });
      } else {
        toast.error(`Erro no Pagar.me: ${res.error}`);
      }
    } catch (err: any) {
      toast.error("Falha ao gerar link");
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const customersAll = useQuery({
    queryKey: ["customers-all"],
    queryFn: async () =>
      (await supabase.from("customers").select("id,name,company,document,phone,email")).data ?? [],
  });

  const [form, setForm] = useState<SaleFormState>({
    alteration_service_order_id: "",
    customer_name: "",
    company: "",
    document: "",
    phone: "",
    email: "",
    total_amount: "",
    paid_amount: "0",
    payment_status: "pago_total",
    payment_method: "pix",
    seller_id: "",
    producer_id: "",
    service_type_id: "",
    package_id: "",
    package_name: "",
    service_quantity: "1",
    notes: "",
    google_drive_link: "",
    platform_link: "",
    sale_date: new Date().toISOString().slice(0, 10),
    lead_source: "",
    with_invoice: "sim",
    installments: "12",
    delivery_deadline: "",
    expected_delivery_date: new Date().toISOString().slice(0, 10),
    video_duration_seconds: "",
    video_duration_breakdown_seconds: [DEFAULT_VIDEO_DURATION],
    video_duration_apply_all: DEFAULT_VIDEO_DURATION,
  });

  const set = useCallback(
    (k: string, v: string) => {
      setForm((f) => {
        const updatedForm = { ...f, [k]: v };

        // Auto-set amount for Pix/Card if status is total
        if (k === "payment_method" && (v === "pix" || v === "cartao")) {
          if (updatedForm.total_amount && updatedForm.payment_status === "pago_total") {
            updatedForm.paid_amount = updatedForm.total_amount;
          }
        }

        // If amount changes and it's already paid total, update paid_amount
        if (k === "total_amount" && updatedForm.payment_status === "pago_total") {
          updatedForm.paid_amount = v;
        }

        // If status changes to total, match amounts
        if (k === "payment_status" && v === "pago_total") {
          updatedForm.paid_amount = updatedForm.total_amount;
        }

        // Se marcar como pendente, zera o valor pago para não cair em validação contraditória.
        if (k === "payment_status" && v === "pendente") {
          updatedForm.paid_amount = "0";
        }

        // Auto-set producer for Pamela/Ester
        const checkInfluencer = () => {
          const selectedServiceType = serviceTypes.data?.find(
            (st) => st.id === (k === "service_type_id" ? v : f.service_type_id),
          );
          const selectedSeller = sellers.data?.find(
            (s) => s.id === (k === "seller_id" ? v : f.seller_id),
          );

          const serviceName = optionText(selectedServiceType?.name, "").toLowerCase();
          const sellerName = optionText(selectedSeller?.name, "").toLowerCase();

          if (
            serviceName.includes("pamela") ||
            serviceName.includes("ester") ||
            sellerName.includes("pamela") ||
            sellerName.includes("ester")
          ) {
            const influencerProducer = producers.data?.find(
              (p) => p.name === "GRAVAÇÃO INFLUENCER",
            );
            if (influencerProducer) updatedForm.producer_id = influencerProducer.id;
          }
        };

        if (k === "service_type_id" || k === "seller_id") {
          checkInfluencer();
        }

        // Evita bloqueio silencioso na geração da venda: para serviços de vídeo/pacote,
        // já deixa a minutagem mínima selecionada. O vendedor ainda pode alterar para
        // 1min, 2min etc. antes de salvar.
        const serviceType = serviceTypes.data?.find(
          (st: any) => st.id === updatedForm.service_type_id,
        );
        const isVideoFlow = isVideoService(serviceType?.name, !!updatedForm.package_id);
        const quantity = clampServiceQuantity(updatedForm.service_quantity);
        updatedForm.service_quantity = String(quantity);

        if (isVideoFlow) {
          const fallbackDuration =
            normalizeDurationValue(updatedForm.video_duration_apply_all) ||
            normalizeDurationValue(updatedForm.video_duration_breakdown_seconds?.find(Boolean)) ||
            normalizeDurationValue(updatedForm.video_duration_seconds) ||
            DEFAULT_VIDEO_DURATION;

          updatedForm.video_duration_breakdown_seconds = hydrateDurationArray(
            updatedForm.video_duration_breakdown_seconds,
            quantity,
            fallbackDuration,
          );
          updatedForm.video_duration_apply_all =
            normalizeDurationValue(updatedForm.video_duration_apply_all) || fallbackDuration;
          const totalDuration = totalDurationFromValues(updatedForm.video_duration_breakdown_seconds);
          updatedForm.video_duration_seconds = totalDuration > 0 ? String(totalDuration) : "";
        } else {
          updatedForm.video_duration_breakdown_seconds = [];
          updatedForm.video_duration_apply_all = DEFAULT_VIDEO_DURATION;
          updatedForm.video_duration_seconds = "";
        }

        return updatedForm;
      });
    },
    [serviceTypes.data, sellers.data, producers.data],
  );

  const updateFormVideoBreakdown = useCallback((updater: (prev: SaleFormState) => SaleFormState) => {
    setForm((prev) => {
      const next = updater(prev);
      const quantity = clampServiceQuantity(next.service_quantity);
      const breakdown = hydrateDurationArray(
        next.video_duration_breakdown_seconds,
        quantity,
        normalizeDurationValue(next.video_duration_apply_all) ||
          normalizeDurationValue(next.video_duration_breakdown_seconds?.find(Boolean)) ||
          DEFAULT_VIDEO_DURATION,
      );
      const totalDuration = totalDurationFromValues(breakdown);
      return {
        ...next,
        service_quantity: String(quantity),
        video_duration_breakdown_seconds: breakdown,
        video_duration_apply_all:
          normalizeDurationValue(next.video_duration_apply_all) ||
          normalizeDurationValue(breakdown[0]) ||
          DEFAULT_VIDEO_DURATION,
        video_duration_seconds: totalDuration > 0 ? String(totalDuration) : "",
      };
    });
  }, []);

  const handleFormVideoDurationChange = useCallback((index: number, value: string) => {
    updateFormVideoBreakdown((prev) => {
      const quantity = clampServiceQuantity(prev.service_quantity);
      const breakdown = hydrateDurationArray(
        prev.video_duration_breakdown_seconds,
        quantity,
        normalizeDurationValue(prev.video_duration_apply_all) ||
          normalizeDurationValue(prev.video_duration_breakdown_seconds?.find(Boolean)) ||
          DEFAULT_VIDEO_DURATION,
      );
      breakdown[index] = normalizeDurationValue(value);
      return {
        ...prev,
        video_duration_breakdown_seconds: breakdown,
        video_duration_apply_all:
          normalizeDurationValue(prev.video_duration_apply_all) ||
          normalizeDurationValue(value) ||
          DEFAULT_VIDEO_DURATION,
      };
    });
  }, [updateFormVideoBreakdown]);

  const handleFormVideoDurationApplyAllChange = useCallback((value: string) => {
    setForm((prev) => ({
      ...prev,
      video_duration_apply_all: normalizeDurationValue(value) || DEFAULT_VIDEO_DURATION,
    }));
  }, []);

  const applyFormDurationToAllVideos = useCallback(() => {
    updateFormVideoBreakdown((prev) => {
      const fillValue =
        normalizeDurationValue(prev.video_duration_apply_all) ||
        normalizeDurationValue(prev.video_duration_breakdown_seconds?.find(Boolean)) ||
        DEFAULT_VIDEO_DURATION;
      const quantity = clampServiceQuantity(prev.service_quantity);
      return {
        ...prev,
        video_duration_apply_all: fillValue,
        video_duration_breakdown_seconds: Array.from({ length: quantity }, () => fillValue),
      };
    });
  }, [updateFormVideoBreakdown]);

  // ID do cliente existente que o usuário escolheu reutilizar (quando há homônimos).
  // Quando nulo, a venda sempre cria/usa um cliente novo conforme os dados digitados.
  const [linkedCustomerId, setLinkedCustomerId] = useState<string | null>(null);

  const autofillFromCustomer = (field: "customer_name" | "company", value: string) => {
    // Apenas atualiza o campo digitado — NÃO sobrescreve outros campos automaticamente,
    // pois clientes diferentes podem ter o mesmo nome/empresa.
    setForm((f) => ({ ...f, [field]: value }));
    // Se o usuário começou a digitar de novo, desfaz qualquer vínculo anterior.
    setLinkedCustomerId(null);
  };

  // Sugestões (homônimos) baseadas no nome digitado
  const customerSuggestions = (() => {
    const v = form.customer_name.trim().toLowerCase();
    if (!v) return [] as any[];
    return (customersAll.data ?? []).filter((c: any) => (c.name ?? "").toLowerCase() === v);
  })();

  const applyExistingCustomer = (c: any) => {
    setForm((f) => ({
      ...f,
      customer_name: c.name ?? f.customer_name,
      company: c.company ?? "",
      document: c.document ?? "",
      phone: c.phone ?? "",
      email: c.email ?? "",
    }));
    setLinkedCustomerId(c.id);
  };

  const selectedServiceName = useMemo(
    () => serviceTypes.data?.find((st: any) => st.id === form.service_type_id)?.name,
    [serviceTypes.data, form.service_type_id],
  );
  const isAlterationSale = /altera[cç][aã]o/i.test(selectedServiceName ?? "");
  const formNeedsVideoDuration = !isAlterationSale && isVideoService(selectedServiceName, !!form.package_id);

  const alterationCards = useQuery({
    queryKey: ["sales-alteration-cards"],
    enabled: isAlterationSale,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("service_orders")
        .select("id,title,producer_id,kanban_columns(name),sales:sales!service_orders_sale_id_fkey(customer_id,customers(id,name,company,document,phone,email))")
        .order("updated_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []).map((card: any) => ({
        id: card.id,
        title: card.title,
        producer_id: card.producer_id,
        column_name: card.kanban_columns?.name,
        customer: card.sales?.customers ?? null,
      }));
    },
  });

  const handleAlterationCardChange = useCallback((cardId: string) => {
    const card = (alterationCards.data ?? []).find((item: any) => item.id === cardId);
    setForm((current) => ({
      ...current,
      alteration_service_order_id: cardId,
      producer_id: card?.producer_id || current.producer_id,
      customer_name: card?.customer?.name || current.customer_name,
      company: card?.customer?.company || current.company,
      document: card?.customer?.document || current.document,
      phone: card?.customer?.phone || current.phone,
      email: card?.customer?.email || current.email,
      package_id: "",
      package_name: "",
      service_quantity: "1",
      video_duration_seconds: "",
      video_duration_breakdown_seconds: [],
    }));
    if (card?.customer?.id) setLinkedCustomerId(card.customer.id);
  }, [alterationCards.data]);
  const formReceiptRecommended =
    form.payment_status !== "pendente" || Number(form.paid_amount || 0) > 0;

  const producerLockedByInfluencer =
    (optionText(
      serviceTypes.data?.find((st) => st.id === form.service_type_id)?.name,
      "",
    )
      .toLowerCase()
      .includes("pamela") ||
      optionText(
        serviceTypes.data?.find((st) => st.id === form.service_type_id)?.name,
        "",
      )
        .toLowerCase()
        .includes("ester") ||
      optionText(sellers.data?.find((s) => s.id === form.seller_id)?.name, "")
        .toLowerCase()
        .includes("pamela") ||
      optionText(sellers.data?.find((s) => s.id === form.seller_id)?.name, "")
        .toLowerCase()
        .includes("ester")) ??
    false;

  const submit = async () => {
    if (saving) return; // Prevent double clicks
    const failVal = (field: string, message: string) => {
      toast.error(message, { description: "Revise o campo destacado antes de confirmar a venda." });
      if (typeof document !== "undefined") {
        window.requestAnimationFrame(() => {
          const target = document.querySelector(
            `[data-sale-field="${field}"]`,
          ) as HTMLElement | null;
          target?.scrollIntoView({ block: "center", behavior: "smooth" });
          const focusable = target?.querySelector(
            "input, textarea, button, [role='combobox'], select",
          ) as HTMLElement | null;
          focusable?.focus?.();
        });
      }
      // Não bloqueia: log assíncrono para rastrear falhas de validação.
      logger
        .warn(`Validação falhou (${field}): ${message}`, {
          context: "sales/submit/validation",
          details: {
            field,
            message,
            form: { ...form, phone: form.phone ? "***" : "", email: form.email ? "***" : "" },
            has_receipt: !!receiptFile,
            linked_customer_id: linkedCustomerId,
          },
          silent: true,
        })
        .catch(() => {});
    };
    const required: [string, string][] = [
      ["customer_name", "Nome do cliente"],
      ["phone", "Telefone"],
      ["total_amount", "Valor total"],
      ["paid_amount", "Valor pago"],
      ["payment_status", "Status pagamento"],
      ["payment_method", "Forma de pagamento"],
      ["seller_id", "Vendedor"],
      ["producer_id", "Produtor"],
      ["service_type_id", "Tipo de serviço"],
      ["service_quantity", "Qtd. serviços"],
      ["sale_date", "Data da venda"],
      ["trello_link", "Link Google Drive"],
      ["lead_source", "Origem da venda"],
      ["delivery_deadline", "Prazo de entrega"],
      ["expected_delivery_date", "Data de entrega"],
    ];
    if (isAlterationSale) required.push(["alteration_service_order_id", "Card da alteração"]);

    if (form.with_invoice === "sim") {
      if (!form.company.trim()) {
        return failVal("company", "Preencha o campo: Empresa (obrigatório para vendas com nota)");
      }
    }

    if (form.with_invoice === "sim" && !form.document.trim()) {
      return failVal("document", "Preencha o campo: CPF/CNPJ (obrigatório para vendas com nota)");
    }

    for (const [k, label] of required) {
      const val = String((form as any)[k] ?? "").trim();
      if (k === "trello_link") continue;
      if (!val) {
        return failVal(k, `Preencha o campo: ${label}`);
      }
    }
    // Links são opcionais; validar apenas formato quando preenchidos
    const gLink = form.google_drive_link.trim();
    const pLink = form.platform_link.trim();
    if (gLink && !gLink.toLowerCase().startsWith("http")) {
      return failVal("google_drive_link", "Link do Google Drive inválido.");
    }
    if (pLink && !pLink.toLowerCase().startsWith("http")) {
      return failVal("platform_link", "Link da Plataforma inválido.");
    }
    // Minutagem obrigatória para vídeos / pacotes
    const normalizedQty = clampServiceQuantity(form.service_quantity || 1);
    const formVideoBreakdown = resizeDurationArray(
      form.video_duration_breakdown_seconds,
      normalizedQty,
      "",
    );
    if (formNeedsVideoDuration && !hasCompleteDurationArray(normalizedQty, formVideoBreakdown)) {
      return failVal(
        "video_duration_seconds",
        normalizedQty > 1
          ? "Defina a duracao de todos os videos do pacote."
          : "Selecione a minutagem do video (minimo 30s).",
      );
    }
    if (false) {
      const dur = Number(form.video_duration_seconds);
      if (!dur || dur < 30 || dur % 30 !== 0) {
        return failVal("video_duration_seconds", "Selecione a minutagem do vídeo (mínimo 30s).");
      }
    }
    // Consistência de valores
    const videoDurationBreakdownPayload = formNeedsVideoDuration
      ? formVideoBreakdown.map((value) => Number(value))
      : null;
    const videoDurationTotalPayload = formNeedsVideoDuration
      ? totalDurationFromValues(formVideoBreakdown)
      : null;
    const total = Number(form.total_amount);
    const paid = Number(form.paid_amount || 0);
    const qty = Number(form.service_quantity || 0);
    const totalCents = toCents(total);
    const paidCents = toCents(paid);
    if (!Number.isFinite(total) || total <= 0) {
      return failVal("total_amount", "Valor total deve ser maior que zero.");
    }
    if (!Number.isFinite(paid) || paid < 0) {
      return failVal("paid_amount", "Valor pago inválido.");
    }
    if (paid > total) {
      return failVal("paid_amount", "Valor pago não pode ser maior que o valor total.");
    }
    if (form.payment_status === "pago_total" && paidCents !== totalCents) {
      return failVal("payment_status", "Status 'Pago total' exige valor pago igual ao total.");
    }
    if (form.payment_status === "pago_parcial" && (paidCents <= 0 || paidCents >= totalCents)) {
      return failVal("payment_status", "Status 'Pago parcial' exige valor pago entre 0 e o total.");
    }
    if (form.payment_status === "pendente" && paidCents > 0) {
      return failVal("payment_status", "Status 'Pendente' não pode ter valor pago.");
    }
    if (!Number.isFinite(qty) || qty < 1) {
      return failVal("service_quantity", "Quantidade de serviços deve ser ao menos 1.");
    }
    const phoneDigits = (form.phone || "").replace(/\D/g, "");
    if (phoneDigits.length < 10) {
      return failVal("phone", "Telefone inválido. Informe DDD + número.");
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      return failVal("email", "E-mail inválido.");
    }
    if (
      form.expected_delivery_date &&
      form.sale_date &&
      form.expected_delivery_date < form.sale_date
    ) {
      return failVal(
        "expected_delivery_date",
        "Data de entrega não pode ser anterior à data da venda.",
      );
    }
    setSaving(true);
    try {
      const list = customersAll.data ?? [];
      // 1) Se o usuário escolheu explicitamente reutilizar um cliente, usa esse.
      // 2) Senão, tenta casar por CPF/CNPJ (identificador único e seguro).
      // 3) Caso contrário, cria um cliente novo — mesmo que o nome já exista
      //    (homônimos são clientes diferentes).
      let existing: any = null;
      if (linkedCustomerId) {
        existing = list.find((c: any) => c.id === linkedCustomerId) || null;
      } else if (form.document.trim()) {
        // Só reaproveita o cliente quando o documento é um CPF/CNPJ real
        // (11 ou 14 dígitos). Textos livres como "vai passar" não identificam
        // ninguém e faziam vendas de clientes diferentes cair no mesmo cadastro.
        const digits = form.document.replace(/\D/g, "");
        if (digits.length === 11 || digits.length === 14) {
          existing =
            list.find((c: any) => (c.document ?? "").replace(/\D/g, "") === digits) || null;
        }
      }
      let cust: any;
      if (existing) {
        cust = existing;
      } else {
        const { data, error: ce } = await supabase
          .from("customers")
          .insert({
            name: form.customer_name,
            company: form.company || null,
            document: form.document || null,
            phone: form.phone || null,
            email: form.email || null,
          })
          .select()
          .single();
        if (ce) throw ce;
        cust = data;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: saleRow, error: se } = await supabase
        .from("sales")
        .insert({
          customer_id: cust.id,
          total_amount: Number(form.total_amount),
          paid_amount: Number(form.paid_amount || 0),
          payment_status: form.payment_status as any,
          payment_method: form.payment_method as any,
          seller_id: form.seller_id || null,
          producer_id: form.producer_id || null,
          service_type_id: form.service_type_id || null,
          package_id: form.package_id || null,
          package_name: form.package_name || null,
          service_quantity: normalizedQty,
          notes: form.notes || null,
          trello_link: null,
          google_drive_link: form.google_drive_link || null,
          platform_link: form.platform_link || null,
          lead_source: form.lead_source || null,
          receipt_url: null,
          sale_date: form.sale_date || new Date().toISOString().slice(0, 10),
          delivery_deadline: form.delivery_deadline,
          expected_delivery_date: form.expected_delivery_date,
          video_duration_seconds: videoDurationTotalPayload,
          video_duration_breakdown_seconds: videoDurationBreakdownPayload,
          sale_kind: isAlterationSale ? "alteration" : "standard",
          alteration_service_order_id: isAlterationSale ? form.alteration_service_order_id : null,
          created_by: user?.id,
        })
        .select("id")
        .single();

      if (se) throw se;

      // O comprovante não pode impedir a criação da venda. Primeiro salvamos a
      // venda; se o upload/vínculo do arquivo falhar, registramos o erro e o
      // usuário pode anexar o comprovante depois pela própria venda/financeiro.
      if (receiptFile && saleRow?.id) {
        try {
          const ext = receiptFile.name.split(".").pop() || "bin";
          const path = `${user?.id ?? "anon"}/${saleRow.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
          const { error: ue } = await supabase.storage.from("receipts").upload(path, receiptFile, {
            contentType: receiptFile.type || undefined,
            upsert: false,
          });
          if (ue) throw ue;
          await supabase.from("sales").update({ receipt_url: path }).eq("id", saleRow.id);
          const { error: receiptError } = await supabase.from("sale_receipts").insert({
            sale_id: saleRow.id,
            file_path: path,
            amount: Number(form.paid_amount || 0),
            paid_at: form.sale_date || new Date().toISOString().slice(0, 10),
            uploaded_by: user?.id ?? null,
            notes: "Comprovante inicial",
          });
          if (receiptError) throw receiptError;
        } catch (receiptErr: any) {
          logger
            .warn(
              `Venda criada, mas falhou ao anexar comprovante: ${receiptErr?.message ?? "desconhecido"}`,
              {
                context: "sales/submit/receipt",
                details: {
                  sale_id: saleRow.id,
                  message: receiptErr?.message,
                  code: receiptErr?.code,
                },
                silent: true,
              },
            )
            .catch(() => {});
          toast.warning(
            "Venda criada, mas o comprovante não foi anexado. Você pode anexar depois.",
          );
        }
      }

      // Auto-vincular pasta da Plataforma (se o link colado for /pastas-arquivos/{id})
      if (saleRow?.id) {
        try {
          await autoLinkFolderFromUrl(form.platform_link || form.google_drive_link, {
            saleId: saleRow.id,
          });
        } catch (e) {
          /* não bloqueia a venda */
        }
      }

      toast.success(isAlterationSale
        ? "Alteração vendida — card movido para Alteração a Fazer"
        : "Venda criada — cards de produção gerados automaticamente");
      setOpen(false);
      setForm({
        alteration_service_order_id: "",
        customer_name: "",
        company: "",
        document: "",
        phone: "",
        email: "",
        total_amount: "",
        paid_amount: "0",
        payment_status: "pago_total",
        payment_method: "pix",
        seller_id: "",
        producer_id: "",
        service_type_id: "",
        package_id: "",
        package_name: "",
        service_quantity: "1",
        notes: "",
        google_drive_link: "",
        platform_link: "",
        sale_date: new Date().toISOString().slice(0, 10),
        lead_source: "",
        with_invoice: "sim",
        installments: "12",
        delivery_deadline: "",
        expected_delivery_date: new Date().toISOString().slice(0, 10),
        video_duration_seconds: "",
        video_duration_breakdown_seconds: [DEFAULT_VIDEO_DURATION],
        video_duration_apply_all: DEFAULT_VIDEO_DURATION,
      });
      setReceiptFile(null);
      setLinkedCustomerId(null);
      await qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      await logger.error(`Erro ao criar venda: ${e?.message ?? "desconhecido"}`, {
        context: "sales/submit",
        details: {
          message: e?.message,
          code: e?.code,
          hint: e?.hint,
          details: e?.details,
          stack: e?.stack,
          form: { ...form, phone: form.phone ? "***" : "", email: form.email ? "***" : "" },
          has_receipt: !!receiptFile,
          linked_customer_id: linkedCustomerId,
        },
      });
      toast.error(`Erro ao criar venda: ${e?.message ?? "tente novamente"}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita."))
      return;

    try {
      const { data, error } = await supabase.from("sales").delete().eq("id", id).select("id");
      if (error) throw error;
      if (!data || data.length === 0) {
        toast.error("Você não tem permissão para excluir esta venda.");
        return;
      }
      toast.success("Venda excluída com sucesso");
      qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      toast.error(`Erro ao excluir: ${e.message}`);
    }
  };

  const handleQuickConfirm = async (sale: any) => {
    try {
      const { error } = await supabase
        .from("sales")
        .update({
          payment_status: "pago_total",
          paid_amount: Number(sale.total_amount),
        })
        .eq("id", sale.id);
      if (error) throw error;
      toast.success("Venda confirmada como paga!");
      qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      toast.error(`Erro ao confirmar: ${e.message}`);
    }
  };

  const statusVariant = (s: string): "default" | "secondary" | "destructive" =>
    s === "pago_total" ? "default" : s === "pago_parcial" ? "secondary" : "destructive";

  const editSet = useCallback(
    (k: string, v: any) => {
      setEditing((e) => {
        if (!e) return e;
        const updatedEditing: EditingSale = { ...e, [k]: v };

        // Auto-set amount for Pix/Card if status is total
        if (k === "payment_method" && (v === "pix" || v === "cartao")) {
          if (updatedEditing.total_amount && updatedEditing.payment_status === "pago_total") {
            updatedEditing.paid_amount = updatedEditing.total_amount;
          }
        }

        // If amount changes and it's already paid total, update paid_amount
        if (k === "total_amount" && updatedEditing.payment_status === "pago_total") {
          updatedEditing.paid_amount = v;
        }

        // If status changes to total, match amounts
        if (k === "payment_status" && v === "pago_total") {
          updatedEditing.paid_amount = updatedEditing.total_amount;
        }

        // Auto-set producer for Pamela/Ester
        const checkInfluencer = () => {
          const selectedServiceType = serviceTypes.data?.find(
            (st) => st.id === (k === "service_type_id" ? v : e.service_type_id),
          );
          const selectedSeller = sellers.data?.find(
            (s) => s.id === (k === "seller_id" ? v : e.seller_id),
          );

          const serviceName = optionText(selectedServiceType?.name, "").toLowerCase();
          const sellerName = optionText(selectedSeller?.name, "").toLowerCase();

          if (
            serviceName.includes("pamela") ||
            serviceName.includes("ester") ||
            sellerName.includes("pamela") ||
            sellerName.includes("ester")
          ) {
            const influencerProducer = producers.data?.find(
              (p) => p.name === "GRAVAÇÃO INFLUENCER",
            );
            if (influencerProducer) updatedEditing.producer_id = influencerProducer.id;
          }
        };

        if (k === "service_type_id" || k === "seller_id") {
          checkInfluencer();
        }

        const serviceType = serviceTypes.data?.find(
          (st: any) => st.id === updatedEditing.service_type_id,
        );
        const isVideoFlow = isVideoService(serviceType?.name, !!updatedEditing.package_id);
        const quantity = clampServiceQuantity(updatedEditing.service_quantity);
        updatedEditing.service_quantity = quantity;

        if (isVideoFlow) {
          const fallbackDuration =
            normalizeDurationValue(updatedEditing.video_duration_apply_all) ||
            normalizeDurationValue(updatedEditing.video_duration_breakdown_seconds?.find(Boolean)) ||
            (quantity === 1 ? normalizeDurationValue(updatedEditing.video_duration_seconds) : "");

          const breakdown = resizeDurationArray(
            updatedEditing.video_duration_breakdown_seconds,
            quantity,
            fallbackDuration,
          );
          updatedEditing.video_duration_breakdown_seconds = breakdown;
          updatedEditing.video_duration_apply_all =
            normalizeDurationValue(updatedEditing.video_duration_apply_all) ||
            fallbackDuration ||
            DEFAULT_VIDEO_DURATION;

          const complete = hasCompleteDurationArray(quantity, breakdown);
          if (complete) {
            const totalDuration = totalDurationFromValues(breakdown);
            updatedEditing.video_duration_seconds = totalDuration > 0 ? totalDuration : null;
          } else if (quantity === 1) {
            updatedEditing.video_duration_seconds = Number(breakdown[0] || 0) || null;
          }
        } else {
          updatedEditing.video_duration_breakdown_seconds = [];
          updatedEditing.video_duration_apply_all = DEFAULT_VIDEO_DURATION;
          updatedEditing.video_duration_seconds = null;
        }

        return updatedEditing;
      });
    },
    [serviceTypes.data, sellers.data, producers.data],
  );

  const editFieldChange = useCallback((patch: Partial<EditingSale>) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const next: EditingSale = { ...prev, ...patch };
      if (patch.package_id !== undefined) {
        const selectedPackage = (packages.data ?? []).find(
          (pkg: any) => pkg.id === patch.package_id,
        ) as { name?: string | null; quantity?: number | null } | undefined;
        if (selectedPackage?.name && !patch.package_name) {
          next.package_name = selectedPackage.name;
        }
        if (selectedPackage?.quantity) {
          next.service_quantity = clampServiceQuantity(selectedPackage.quantity);
        }
      }
      const serviceType = serviceTypes.data?.find((st: any) => st.id === next.service_type_id);
      const isVideoFlow = isVideoService(serviceType?.name, !!next.package_id);
      const quantity = clampServiceQuantity(next.service_quantity);
      next.service_quantity = quantity;

      if (isVideoFlow) {
        const fallbackDuration =
          normalizeDurationValue(next.video_duration_apply_all) ||
          normalizeDurationValue(next.video_duration_breakdown_seconds?.find(Boolean)) ||
          (quantity === 1 ? normalizeDurationValue(next.video_duration_seconds) : "");
        const breakdown = resizeDurationArray(
          next.video_duration_breakdown_seconds,
          quantity,
          fallbackDuration,
        );
        next.video_duration_breakdown_seconds = breakdown;
        next.video_duration_apply_all =
          normalizeDurationValue(next.video_duration_apply_all) ||
          fallbackDuration ||
          DEFAULT_VIDEO_DURATION;
        if (hasCompleteDurationArray(quantity, breakdown)) {
          next.video_duration_seconds = totalDurationFromValues(breakdown);
        }
      } else {
        next.video_duration_breakdown_seconds = [];
        next.video_duration_apply_all = DEFAULT_VIDEO_DURATION;
        next.video_duration_seconds = null;
      }

      return next;
    });
  }, [serviceTypes.data, packages.data]);

  const handleEditingVideoDurationChange = useCallback((index: number, value: string) => {
    setEditing((prev) => {
      if (!prev) return prev;
      const quantity = clampServiceQuantity(prev.service_quantity);
      const breakdown = resizeDurationArray(
        prev.video_duration_breakdown_seconds,
        quantity,
        normalizeDurationValue(prev.video_duration_apply_all) ||
          normalizeDurationValue(prev.video_duration_breakdown_seconds?.find(Boolean)) ||
          (quantity === 1 ? normalizeDurationValue(prev.video_duration_seconds) : ""),
      );
      breakdown[index] = normalizeDurationValue(value);
      const complete = hasCompleteDurationArray(quantity, breakdown);
      return {
        ...prev,
        video_duration_breakdown_seconds: breakdown,
        video_duration_apply_all:
          normalizeDurationValue(prev.video_duration_apply_all) ||
          normalizeDurationValue(value) ||
          DEFAULT_VIDEO_DURATION,
        video_duration_seconds: complete
          ? totalDurationFromValues(breakdown)
          : quantity === 1
            ? Number(breakdown[0] || 0) || null
            : prev.video_duration_seconds,
      };
    });
  }, []);

  const handleEditingVideoDurationApplyAllChange = useCallback((value: string) => {
    setEditing((prev) =>
      prev
        ? {
            ...prev,
            video_duration_apply_all: normalizeDurationValue(value) || DEFAULT_VIDEO_DURATION,
          }
        : prev,
    );
  }, []);

  const applyEditingDurationToAllVideos = useCallback(() => {
    setEditing((prev) => {
      if (!prev) return prev;
      const quantity = clampServiceQuantity(prev.service_quantity);
      const fillValue =
        normalizeDurationValue(prev.video_duration_apply_all) ||
        normalizeDurationValue(prev.video_duration_breakdown_seconds?.find(Boolean)) ||
        DEFAULT_VIDEO_DURATION;
      const breakdown = Array.from({ length: quantity }, () => fillValue);
      return {
        ...prev,
        video_duration_apply_all: fillValue,
        video_duration_breakdown_seconds: breakdown,
        video_duration_seconds: totalDurationFromValues(breakdown),
      };
    });
  }, []);

  const submitEdit = async () => {
    if (!editing || editSaving) return;

    // Validate required fields
    const required: [string, string][] = [
      ["customer_name", "Nome do cliente"],
      ["phone", "Telefone"],
      ["total_amount", "Valor total"],
      ["paid_amount", "Valor pago"],
      ["payment_status", "Status pagamento"],
      ["payment_method", "Forma de pagamento"],
      ["seller_id", "Vendedor"],
      ["producer_id", "Produtor"],
      ["service_type_id", "Tipo de serviço"],
      ["service_quantity", "Qtd. serviços"],
      ["sale_date", "Data da venda"],
      ["trello_link", "Link Google Drive"],
      ["lead_source", "Origem da venda"],
      ["delivery_deadline", "Prazo de entrega"],
      ["expected_delivery_date", "Data de entrega"],
    ];

    for (const [k, label] of required) {
      const val = String((editing as any)[k] ?? "").trim();
      if (k === "trello_link") continue;
      if (!val) {
        toast.error(`Preencha o campo: ${label}`);
        return;
      }
    }
    {
      const stName = serviceTypes.data?.find((st: any) => st.id === editing.service_type_id)?.name;
      const editingQty = clampServiceQuantity(editing.service_quantity || 1);
      const editingVideoBreakdown = resizeDurationArray(
        editing.video_duration_breakdown_seconds,
        editingQty,
        "",
      );
      const legacyWithoutBreakdown =
        editingQty > 1 &&
        !hasAnyDurationValue(editingVideoBreakdown) &&
        !!normalizeDurationValue(editing.video_duration_seconds);
      if (
        isVideoService(stName, !!editing.package_id) &&
        !legacyWithoutBreakdown &&
        !hasCompleteDurationArray(editingQty, editingVideoBreakdown)
      ) {
        toast.error(
          editingQty > 1
            ? "Defina a duracao de todos os videos do pacote."
            : "Selecione a minutagem do video (minimo 30s).",
        );
        return;
      }
      if (false) {
        const dur = Number(editing?.video_duration_seconds);
        if (!dur || dur < 30 || dur % 30 !== 0) {
          toast.error("Selecione a minutagem do vídeo (mínimo 30s).");
          return;
        }
      }
    }

    const editQty = clampServiceQuantity(editing.service_quantity || 1);
    const editBreakdownRaw = resizeDurationArray(
      editing.video_duration_breakdown_seconds,
      editQty,
      "",
    );
    const editHasCompleteBreakdown = hasCompleteDurationArray(editQty, editBreakdownRaw);
    const editVideoBreakdownPayload = editHasCompleteBreakdown
      ? editBreakdownRaw.map((value) => Number(value))
      : null;
    const editVideoDurationTotalPayload = editVideoBreakdownPayload
      ? totalDurationFromValues(editBreakdownRaw)
      : normalizeDurationValue(editing.video_duration_seconds)
        ? Number(editing.video_duration_seconds)
        : null;

    setEditSaving(true);
    try {
      if (editing.with_invoice === "sim") {
        if (!String(editing.company || "").trim()) {
          toast.error("Preencha o campo: Empresa (obrigatório para vendas com nota)");
          setEditSaving(false);
          return;
        }
        if (!String(editing.document || "").trim()) {
          toast.error("Preencha o campo: CPF/CNPJ (obrigatório para vendas com nota)");
          setEditSaving(false);
          return;
        }
      }
      if (editing.customer_id) {
        const { error: cuError } = await supabase
          .from("customers")
          .update({
            name: editing.customer_name || editing.customers?.name || undefined,
            company: editing.company || editing.customers?.company,
            document: editing.document || editing.customers?.document,
            phone: editing.phone || editing.customers?.phone,
            email: editing.email || editing.customers?.email,
          })
          .eq("id", editing.customer_id);
        if (cuError) throw cuError;
      }
      const { error } = await supabase
        .from("sales")
        .update({
          sale_date: editing.sale_date,
          total_amount: Number(editing.total_amount),
          paid_amount: Number(editing.paid_amount || 0),
          payment_status: editing.payment_status,
          payment_method: editing.payment_method,
          seller_id: editing.seller_id || null,
          producer_id: editing.producer_id || null,
          service_type_id: editing.service_type_id || null,
          package_id: editing.package_id || null,
          package_name: editing.package_name || null,
          service_quantity: editQty,
          notes: editing.notes || null,
          trello_link: null,
          google_drive_link: editing.google_drive_link || null,
          platform_link: editing.platform_link || null,
          lead_source: editing.lead_source || null,
          delivery_deadline: editing.delivery_deadline || null,
          expected_delivery_date: editing.expected_delivery_date || null,
          video_duration_seconds: editVideoDurationTotalPayload,
          video_duration_breakdown_seconds: editVideoBreakdownPayload,
        })
        .eq("id", editing.id);
      if (error) throw error;

      // Auto-vincular pasta da Plataforma com base no link
      try {
        await autoLinkFolderFromUrl(editing.platform_link || editing.google_drive_link, {
          saleId: editing.id,
        });
      } catch (e) {
        /* não bloqueia o save */
      }

      // Propagar link/produtor para as ordens de serviço existentes
      try {
        await supabase
          .from("service_orders")
          .update({
            trello_link: null,
            producer_id: editing.producer_id || null,
            expected_delivery_date: editing.expected_delivery_date || null,
          })
          .eq("sale_id", editing.id);

        // Recalcular valor apenas das notas ainda não emitidas (não sobrescrever notas já processadas)
        if (!editing.package_id) {
          const qty = Math.max(1, Number(editing.service_quantity || 1));
          const unit = Number(editing.total_amount) / qty;
          await supabase
            .from("invoices")
            .update({ amount: unit })
            .eq("sale_id", editing.id)
            .eq("status", "a_fazer");
        }
      } catch (propErr: any) {
        await logger.error(`Erro ao propagar edição: ${propErr?.message}`, {
          context: "sales/submitEdit/propagate",
          details: { error: propErr },
        });
      }

      // Acrescentar serviços novos se a quantidade aumentou
      try {
        const newQty = Math.max(1, Number(editing.service_quantity || 1));
        const { data: existingOrders } = await supabase
          .from("service_orders")
          .select("id, service_index")
          .eq("sale_id", editing.id);
        const currentCount = existingOrders?.length ?? 0;
        if (newQty > currentCount) {
          let colId: string | undefined;
          const { data: defCol } = await supabase
            .from("kanban_columns")
            .select("id")
            .eq("is_default", true)
            .limit(1)
            .maybeSingle();
          colId = defCol?.id;
          if (!colId) {
            const { data: firstCol } = await supabase
              .from("kanban_columns")
              .select("id")
              .order("sort_order")
              .limit(1)
              .maybeSingle();
            colId = firstCol?.id;
          }
          const custName = editing.customer_name || editing.customers?.name || "Cliente";
          const stName =
            (serviceTypes.data ?? []).find((st: any) => st.id === editing.service_type_id)?.name ||
            "Serviço";
          const newOrders: any[] = [];
          for (let i = currentCount + 1; i <= newQty; i++) {
            newOrders.push({
              sale_id: editing.id,
              column_id: colId,
              service_index: i,
              title: `${custName} • ${stName} #${i}`,
              description: editing.notes || null,
              sort_order: i,
              producer_id: editing.producer_id || null,
              expected_delivery_date: editing.expected_delivery_date || null,
              trello_link: null,
              video_duration_seconds: editVideoBreakdownPayload?.[i - 1] ?? null,
            });
          }
          if (newOrders.length && colId) {
            const { error: soErr } = await supabase.from("service_orders").insert(newOrders);
            if (soErr) throw soErr;
          }
          // Notas fiscais adicionais (apenas se não for pacote)
          if (!editing.package_id && editing.customer_id) {
            const unit = Number(editing.total_amount) / newQty;
            const newInvoices: any[] = [];
            for (let i = 0; i < newQty - currentCount; i++) {
              newInvoices.push({
                sale_id: editing.id,
                customer_id: editing.customer_id,
                amount: unit,
                status: "a_fazer",
                notes: editing.notes || null,
              });
            }
            if (newInvoices.length) {
              await supabase.from("invoices").insert(newInvoices);
            }
          }
          toast.success(`${newQty - currentCount} serviço(s) adicionado(s) à venda`);
        }
      } catch (addErr: any) {
        await logger.error(`Erro ao acrescentar serviços: ${addErr?.message}`, {
          context: "sales/submitEdit/addServices",
          details: { error: addErr },
        });
      }

      toast.success("Venda atualizada");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      await logger.error(`Erro ao atualizar venda: ${e.message}`, {
        context: "sales/submitEdit",
        details: { editing, error: e },
      });
      toast.error(`Erro ao atualizar venda: ${e?.message ?? "tente novamente"}`);
    } finally {
      setEditSaving(false);
    }
  };

  const handleFormPackageChange = useCallback((packageId: string) => {
    const selectedPackage = (packages.data ?? []).find((pkg: any) => pkg.id === packageId) as
      | { id: string; name?: string | null; quantity?: number | null }
      | undefined;

    setForm((prev) => {
      const nextQuantity = selectedPackage?.quantity
        ? clampServiceQuantity(selectedPackage.quantity)
        : clampServiceQuantity(prev.service_quantity);
      const fallbackDuration =
        normalizeDurationValue(prev.video_duration_apply_all) ||
        normalizeDurationValue(prev.video_duration_breakdown_seconds?.find(Boolean)) ||
        DEFAULT_VIDEO_DURATION;
      const breakdown = hydrateDurationArray(
        prev.video_duration_breakdown_seconds,
        nextQuantity,
        fallbackDuration,
      );
      return {
        ...prev,
        package_id: packageId,
        package_name: selectedPackage?.name ?? prev.package_name,
        service_quantity: String(nextQuantity),
        video_duration_breakdown_seconds: breakdown,
        video_duration_apply_all: fallbackDuration,
        video_duration_seconds: String(totalDurationFromValues(breakdown)),
      };
    });
  }, [packages.data]);

  const openEdit = async (sale: SaleRecord) => {
    const quantity = clampServiceQuantity(sale.service_quantity || 1);
    let breakdown = resizeDurationArray(
      sale.video_duration_breakdown_seconds,
      quantity,
      quantity === 1 ? normalizeDurationValue(sale.video_duration_seconds) : "",
    );

    try {
      const { data: orderDurations, error } = await supabase
        .from("service_orders")
        .select("service_index,video_duration_seconds")
        .eq("sale_id", sale.id)
        .order("service_index", { ascending: true });
      if (error) throw error;

      if ((orderDurations ?? []).length > 0) {
        const fromOrders = Array.from({ length: quantity }, () => "");
        for (const order of orderDurations ?? []) {
          const index = Number(order.service_index ?? 0);
          if (index >= 1 && index <= quantity) {
            fromOrders[index - 1] = normalizeDurationValue(order.video_duration_seconds);
          }
        }
        if (hasAnyDurationValue(fromOrders)) {
          breakdown = resizeDurationArray(fromOrders, quantity, "");
        }
      }
    } catch (error: any) {
      await logger.warn(`Erro ao carregar minutagem da venda ${sale.id}: ${error?.message ?? error}`, {
        context: "sales/openEdit/video-durations",
        details: { sale_id: sale.id, error },
        silent: true,
      });
    }

    const completeBreakdown = hasCompleteDurationArray(quantity, breakdown);
    setEditing({
      ...sale,
      service_quantity: quantity,
      video_duration_breakdown_seconds: breakdown,
      video_duration_apply_all:
        normalizeDurationValue(breakdown.find(Boolean)) || DEFAULT_VIDEO_DURATION,
      video_duration_seconds: completeBreakdown
        ? totalDurationFromValues(breakdown)
        : sale.video_duration_seconds ?? null,
      with_invoice: sale.customers?.document ? "sim" : "nao",
      customer_name: sale.customers?.name ?? undefined,
      company: sale.customers?.company ?? undefined,
      document: sale.customers?.document ?? undefined,
      phone: sale.customers?.phone ?? undefined,
      email: sale.customers?.email ?? undefined,
    });
  };

  return (
    <div className="space-y-6">
      <SalesHeroSection
        totalVendasHoje={totalVendasHoje}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isGeneratingLink={isGeneratingLink}
        newSaleDialogProps={{
          open,
          onOpenChange: setOpen,
          form,
          set,
          onPackageChange: handleFormPackageChange,
          customersAll: customersAll.data ?? [],
          customerSuggestions,
          linkedCustomerId,
          onAutofillFromCustomer: autofillFromCustomer,
          onApplyExistingCustomer: applyExistingCustomer,
          onClearLinkedCustomer: () => setLinkedCustomerId(null),
          sellers: sellers.data ?? [],
          producers: producers.data ?? [],
          serviceTypes: serviceTypes.data ?? [],
          packages: packages.data ?? [],
          producerLockedByInfluencer,
          formNeedsVideoDuration,
          isAlterationSale,
          alterationCards: alterationCards.data ?? [],
          onAlterationCardChange: handleAlterationCardChange,
          formReceiptRecommended,
          receiptFile,
          onReceiptFileChange: setReceiptFile,
          saving,
          onVideoDurationChange: handleFormVideoDurationChange,
          onVideoDurationApplyAllChange: handleFormVideoDurationApplyAllChange,
          onApplyDurationToAllVideos: applyFormDurationToAllVideos,
          onSubmit: submit,
        }}
      />

      <SalesFiltersBar
        fSearch={fSearch}
        setFSearch={setFSearch}
        fSeller={fSeller}
        setFSeller={setFSeller}
        fProducer={fProducer}
        setFProducer={setFProducer}
        fService={fService}
        setFService={setFService}
        fYear={fYear}
        setFYear={setFYear}
        fMonth={fMonth}
        setFMonth={setFMonth}
        fFrom={fFrom}
        setFFrom={setFFrom}
        fTo={fTo}
        setFTo={setFTo}
        sellers={sellers.data ?? []}
        producers={producers.data ?? []}
        serviceTypes={serviceTypes.data ?? []}
        yearOptions={yearOptions}
        filteredCount={filteredSales.length}
        totalCount={(salesList ?? []).length}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
      />

      {viewMode === "table" ? (
        <SalesTableView
          loadingSales={loadingSales}
          salesError={salesError}
          filteredSales={filteredSales}
          onRefetch={() => refetch()}
          statusVariant={statusVariant}
          onGenerateLink={handleGenerateLink}
          onEdit={openEdit}
          onDelete={handleDelete}
          onQuickConfirm={handleQuickConfirm}
        />
      ) : (
        <SalesCardView
          loadingSales={loadingSales}
          salesError={salesError}
          filteredSales={filteredSales}
          onRetry={() => qc.invalidateQueries({ queryKey: ["sales-list"] })}
          statusVariant={statusVariant}
          onGenerateLink={handleGenerateLink}
          onEdit={openEdit}
          onDelete={handleDelete}
          onQuickConfirm={handleQuickConfirm}
        />
      )}

      <EditSaleDialog
        editing={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onFieldChange={editFieldChange}
        editSet={editSet}
        customersAll={customersAll.data ?? []}
        sellers={sellers.data ?? []}
        producers={producers.data ?? []}
        serviceTypes={serviceTypes.data ?? []}
        packages={packages.data ?? []}
        editSaving={editSaving}
        onVideoDurationChange={handleEditingVideoDurationChange}
        onVideoDurationApplyAllChange={handleEditingVideoDurationApplyAllChange}
        onApplyDurationToAllVideos={applyEditingDurationToAllVideos}
        onCancel={() => setEditing(null)}
        onSubmit={submitEdit}
      />

      <PaymentLinkDialog
        paymentLinkData={paymentLinkData}
        onOpenChange={(o) => !o && setPaymentLinkData(null)}
      />
    </div>
  );
}
