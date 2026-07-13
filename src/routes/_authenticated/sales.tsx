import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback, useMemo, Component, type ErrorInfo, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Download, History, LayoutGrid, List, QrCode } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2, Pencil, Eye, Trash2, Check, Search, X, ShoppingCart } from "lucide-react";
import { User, Building2, Badge as BadgeIcon, Phone, Mail, DollarSign, CreditCard, Package as PackageIcon, Layers, Calendar, Compass, MessageSquare, Link as LinkIcon, Upload as UploadIcon, ShieldCheck, Users, Clapperboard, Clock, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { createPaymentLink } from "@/lib/pagarme.functions";
import { Copy, Link2, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { autoLinkFolderFromUrl } from "@/lib/project-folders";
import { PhoneInputBR } from "@/components/phone-input-br";
import { SafeSelect } from "@/components/safe-select";

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
      } catch { /* noop */ }
    }
    return (
      <div className="max-w-xl mx-auto mt-10 p-6 rounded-lg border border-destructive/30 bg-destructive/5 text-sm space-y-3">
        <h2 className="text-lg font-semibold text-destructive">Erro ao abrir a página de Vendas</h2>
        <p className="text-muted-foreground">Tente recarregar. Se persistir, envie o texto abaixo.</p>
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
          <a href="/" className="rounded-md border px-4 py-2 text-sm">Ir para início</a>
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
    logger.error(`Sales UI crashed: ${error.message}`, {
      context: "sales/ui-boundary",
      details: { message: error.message, stack: error.stack, componentStack: errorInfo.componentStack },
      silent: true,
    }).catch(() => {});

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

function optionValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function toCents(value: unknown): number {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return NaN;
  return Math.round(n * 100);
}

// Opções: 30s, 1min, 1min30, 2min, ..., 10min
const VIDEO_DURATION_OPTIONS: { value: number; label: string }[] = Array.from({ length: 20 }, (_, i) => {
  const sec = (i + 1) * 30;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const label = m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
  return { value: sec, label };
});

export function formatVideoDuration(sec?: number | null): string {
  if (!sec || sec < 1) return "";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
}

function SalesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [editing, setEditing] = useState<any>(null);
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

  const { data: salesList, isLoading: loadingSales, error: salesError, refetch } = useQuery({
    queryKey: ["sales-list"],
    queryFn: async () => {
      // Tentamos o select completo
      const { data, error } = await supabase
        .from("sales")
        .select("*, customers!inner(name,company,phone,email,document), sellers(name), producers(name), service_types(name), sale_receipts(*)")
        .order("sale_date", { ascending: false });
      
      if (error) {
        console.error("Supabase error fetching sales:", error);
        // Fallback: tenta sem o join restritivo (pode ser problema de dado órfão)
        const { data: fb, error: fbe } = await supabase
          .from("sales")
          .select("*, customers(name,company,phone,email,document), sellers(name), producers(name), service_types(name), sale_receipts(*)")
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

  const sellers = useQuery({ queryKey: ["sellers-all"], queryFn: async () => {
    const { data, error } = await supabase.from("sellers").select("id,name").eq("active", true);
    if (error) { toast.error("Erro ao carregar vendedores"); throw error; }
    return data ?? [];
  }});
  const producers = useQuery({ queryKey: ["producers-all"], queryFn: async () => {
    const { data, error } = await supabase.from("producers").select("id,name").eq("active", true);
    if (error) { toast.error("Erro ao carregar produtores"); throw error; }
    return data ?? [];
  }});
  const serviceTypes = useQuery({ queryKey: ["st-all"], queryFn: async () => {
    const { data, error } = await supabase.from("service_types").select("id,name").eq("active", true).order("sort_order");
    if (error) { toast.error("Erro ao carregar tipos de serviço"); throw error; }
    return data ?? [];
  }});
  const packages = useQuery({ queryKey: ["pkg-all"], queryFn: async () => {
    const { data, error } = await supabase.from("packages").select("id,name,quantity").eq("active", true);
    if (error) { toast.error("Erro ao carregar pacotes"); throw error; }
    return data ?? [];
  }});

  const filteredSales = useMemo(() => {
    const list = salesList ?? [];
    const term = fSearch.trim().toLowerCase();
    return list.filter((s: any) => {
      if (fSeller !== "all" && s.seller_id !== fSeller) return false;
      if (fProducer !== "all" && s.producer_id !== fProducer) return false;
      if (fService !== "all" && s.service_type_id !== fService) return false;
      const d = s.sale_date ? new Date(s.sale_date) : null;
      if (d) {
        if (fYear !== "all" && String(d.getFullYear()) !== fYear) return false;
        if (fMonth !== "all" && String(d.getMonth() + 1) !== fMonth) return false;
        if (fFrom && s.sale_date < fFrom) return false;
        if (fTo && s.sale_date > fTo + "T23:59:59") return false;
      }
      if (term) {
        const hay = [
          s.customers?.name, s.customers?.company,
          s.service_types?.name, s.sellers?.name, s.producers?.name,
        ].filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [salesList, fSearch, fSeller, fProducer, fService, fYear, fMonth, fFrom, fTo]);

  const yearOptions = useMemo(() => {
    const ys = new Set<string>();
    (salesList ?? []).forEach((s: any) => { if (s.sale_date) ys.add(String(new Date(s.sale_date).getFullYear())); });
    return Array.from(ys).sort((a, b) => Number(b) - Number(a));
  }, [salesList]);

  const clearFilters = () => {
    setFSearch(""); setFSeller("all"); setFProducer("all"); setFService("all");
    setFYear("all"); setFMonth("all"); setFFrom(""); setFTo("");
  };
  const hasFilters = fSearch || fSeller !== "all" || fProducer !== "all" || fService !== "all" || fYear !== "all" || fMonth !== "all" || fFrom || fTo;

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
        }
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
    queryFn: async () => (await supabase.from("customers").select("id,name,company,document,phone,email")).data ?? [],
  });

  const [form, setForm] = useState({
    customer_name: "", company: "", document: "", phone: "", email: "",
    total_amount: "", paid_amount: "0", payment_status: "pago_total",
    payment_method: "pix", seller_id: "", producer_id: "", service_type_id: "",
    package_id: "", package_name: "", service_quantity: "1", notes: "",
    google_drive_link: "", platform_link: "",
    sale_date: new Date().toISOString().slice(0, 10), lead_source: "",
    with_invoice: "sim",
    installments: "12",
    delivery_deadline: "",
    expected_delivery_date: new Date().toISOString().slice(0, 10),
    video_duration_seconds: "",
  });

  const set = useCallback((k: string, v: string) => {
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
        const selectedServiceType = serviceTypes.data?.find(st => st.id === (k === "service_type_id" ? v : f.service_type_id));
        const selectedSeller = sellers.data?.find(s => s.id === (k === "seller_id" ? v : f.seller_id));
        
        const serviceName = optionText(selectedServiceType?.name, "").toLowerCase();
        const sellerName = optionText(selectedSeller?.name, "").toLowerCase();
        
        if (serviceName.includes("pamela") || serviceName.includes("ester") || 
            sellerName.includes("pamela") || sellerName.includes("ester")) {
          const influencerProducer = producers.data?.find(p => p.name === "GRAVAÇÃO INFLUENCER");
          if (influencerProducer) updatedForm.producer_id = influencerProducer.id;
        }
      };

      if (k === "service_type_id" || k === "seller_id") {
        checkInfluencer();
      }

      // Evita bloqueio silencioso na geração da venda: para serviços de vídeo/pacote,
      // já deixa a minutagem mínima selecionada. O vendedor ainda pode alterar para
      // 1min, 2min etc. antes de salvar.
      if (k === "service_type_id" || k === "package_id") {
        const serviceType = serviceTypes.data?.find((st: any) => st.id === updatedForm.service_type_id);
        if (isVideoService(serviceType?.name, !!updatedForm.package_id) && !updatedForm.video_duration_seconds) {
          updatedForm.video_duration_seconds = "30";
        }
      }
      
      return updatedForm;
    });
  }, [serviceTypes.data, sellers.data, producers.data]);

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
    return (customersAll.data ?? []).filter(
      (c: any) => (c.name ?? "").toLowerCase() === v
    );
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
  const formNeedsVideoDuration = isVideoService(selectedServiceName, !!form.package_id);
  const formReceiptRecommended = form.payment_status !== "pendente" || Number(form.paid_amount || 0) > 0;

  const submit = async () => {
    if (saving) return; // Prevent double clicks
    const failVal = (field: string, message: string) => {
      toast.error(message, { description: "Revise o campo destacado antes de confirmar a venda." });
      if (typeof document !== "undefined") {
        window.requestAnimationFrame(() => {
          const target = document.querySelector(`[data-sale-field="${field}"]`) as HTMLElement | null;
          target?.scrollIntoView({ block: "center", behavior: "smooth" });
          const focusable = target?.querySelector("input, textarea, button, [role='combobox'], select") as HTMLElement | null;
          focusable?.focus?.();
        });
      }
      // Não bloqueia: log assíncrono para rastrear falhas de validação.
      logger.warn(`Validação falhou (${field}): ${message}`, {
        context: "sales/submit/validation",
        details: {
          field,
          message,
          form: { ...form, phone: form.phone ? "***" : "", email: form.email ? "***" : "" },
          has_receipt: !!receiptFile,
          linked_customer_id: linkedCustomerId,
        },
        silent: true,
      }).catch(() => {});
    };
    const required: [string, string][] = [
      ["customer_name", "Nome do cliente"],
      ["phone", "Telefone"], ["total_amount", "Valor total"], ["paid_amount", "Valor pago"],
      ["payment_status", "Status pagamento"], ["payment_method", "Forma de pagamento"],
      ["seller_id", "Vendedor"], ["producer_id", "Produtor"], ["service_type_id", "Tipo de serviço"],
      ["service_quantity", "Qtd. serviços"], ["sale_date", "Data da venda"], ["trello_link", "Link Google Drive"],
      ["lead_source", "Origem da venda"], ["delivery_deadline", "Prazo de entrega"],
      ["expected_delivery_date", "Data de entrega"],
    ];

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
    if (formNeedsVideoDuration) {
      const dur = Number(form.video_duration_seconds);
      if (!dur || dur < 30 || dur % 30 !== 0) {
        return failVal("video_duration_seconds", "Selecione a minutagem do vídeo (mínimo 30s).");
      }
    }
    // Consistência de valores
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
    if (form.expected_delivery_date && form.sale_date && form.expected_delivery_date < form.sale_date) {
      return failVal("expected_delivery_date", "Data de entrega não pode ser anterior à data da venda.");
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
        const doc = form.document.trim();
        existing = list.find((c: any) => (c.document ?? "").trim() === doc) || null;
      }
      let cust: any;
      if (existing) {
        cust = existing;
      } else {
        const { data, error: ce } = await supabase.from("customers").insert({
          name: form.customer_name, company: form.company || null, document: form.document || null,
          phone: form.phone || null, email: form.email || null,
        }).select().single();
        if (ce) throw ce;
        cust = data;
      }

      const { data: { user } } = await supabase.auth.getUser();

      const { data: saleRow, error: se } = await supabase.from("sales").insert({
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
        service_quantity: Number(form.service_quantity || 1),
        notes: form.notes || null,
        trello_link: null,
        google_drive_link: form.google_drive_link || null,
        platform_link: form.platform_link || null,
        lead_source: form.lead_source || null,
        receipt_url: null,
        sale_date: form.sale_date || new Date().toISOString().slice(0, 10),
        delivery_deadline: form.delivery_deadline,
        expected_delivery_date: form.expected_delivery_date,
        video_duration_seconds: form.video_duration_seconds ? Number(form.video_duration_seconds) : null,
        created_by: user?.id,
      }).select("id").single();

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
          logger.warn(`Venda criada, mas falhou ao anexar comprovante: ${receiptErr?.message ?? "desconhecido"}`, {
            context: "sales/submit/receipt",
            details: { sale_id: saleRow.id, message: receiptErr?.message, code: receiptErr?.code },
            silent: true,
          }).catch(() => {});
          toast.warning("Venda criada, mas o comprovante não foi anexado. Você pode anexar depois.");
        }
      }

      // Auto-vincular pasta da Plataforma (se o link colado for /pastas-arquivos/{id})
      if (saleRow?.id) {
        try {
          await autoLinkFolderFromUrl(form.platform_link || form.google_drive_link, { saleId: saleRow.id });
        } catch (e) { /* não bloqueia a venda */ }
      }

      toast.success("Venda criada — cards de produção gerados automaticamente");
      setOpen(false);
      setForm({
        customer_name: "", company: "", document: "", phone: "", email: "",
        total_amount: "", paid_amount: "0", payment_status: "pago_total",
        payment_method: "pix", seller_id: "", producer_id: "", service_type_id: "",
        package_id: "", package_name: "", service_quantity: "1", notes: "",
        google_drive_link: "", platform_link: "",
        sale_date: new Date().toISOString().slice(0, 10), lead_source: "",
        with_invoice: "sim",
        installments: "12",
        delivery_deadline: "",
        expected_delivery_date: new Date().toISOString().slice(0, 10),
        video_duration_seconds: "",
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
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.")) return;
    
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
      const { error } = await supabase.from("sales").update({
        payment_status: "pago_total",
        paid_amount: Number(sale.total_amount)
      }).eq("id", sale.id);
      if (error) throw error;
      toast.success("Venda confirmada como paga!");
      qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      toast.error(`Erro ao confirmar: ${e.message}`);
    }
  };

  const statusVariant = (s: string) =>
    s === "pago_total" ? "default" : s === "pago_parcial" ? "secondary" : "destructive";

  const editSet = useCallback((k: string, v: any) => {
    setEditing((e: any) => {
      if (!e) return e;
      const updatedEditing = { ...e, [k]: v };
      
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
        const selectedServiceType = serviceTypes.data?.find(st => st.id === (k === "service_type_id" ? v : e.service_type_id));
        const selectedSeller = sellers.data?.find(s => s.id === (k === "seller_id" ? v : e.seller_id));
        
        const serviceName = optionText(selectedServiceType?.name, "").toLowerCase();
        const sellerName = optionText(selectedSeller?.name, "").toLowerCase();
        
        if (serviceName.includes("pamela") || serviceName.includes("ester") || 
            sellerName.includes("pamela") || sellerName.includes("ester")) {
          const influencerProducer = producers.data?.find(p => p.name === "GRAVAÇÃO INFLUENCER");
          if (influencerProducer) updatedEditing.producer_id = influencerProducer.id;
        }
      };

      if (k === "service_type_id" || k === "seller_id") {
        checkInfluencer();
      }
      
      return updatedEditing;
    });
  }, [serviceTypes.data, sellers.data, producers.data]);

  const submitEdit = async () => {
    if (!editing || editSaving) return;

    // Validate required fields
    const required: [string, string][] = [
      ["customer_name", "Nome do cliente"],
      ["phone", "Telefone"], ["total_amount", "Valor total"], ["paid_amount", "Valor pago"],
      ["payment_status", "Status pagamento"], ["payment_method", "Forma de pagamento"],
      ["seller_id", "Vendedor"], ["producer_id", "Produtor"], ["service_type_id", "Tipo de serviço"],
      ["service_quantity", "Qtd. serviços"], ["sale_date", "Data da venda"], ["trello_link", "Link Google Drive"],
      ["lead_source", "Origem da venda"], ["delivery_deadline", "Prazo de entrega"],
      ["expected_delivery_date", "Data de entrega"],
    ];

    for (const [k, label] of required) {
      const val = String(editing[k] ?? "").trim();
      if (k === "trello_link") continue;
      if (!val) {
        toast.error(`Preencha o campo: ${label}`);
        return;
      }
    }
    {
      const stName = serviceTypes.data?.find((st: any) => st.id === editing.service_type_id)?.name;
      if (isVideoService(stName, !!editing.package_id)) {
        const dur = Number(editing.video_duration_seconds);
        if (!dur || dur < 30 || dur % 30 !== 0) {
          toast.error("Selecione a minutagem do vídeo (mínimo 30s).");
          return;
        }
      }
    }

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
        const { error: cuError } = await supabase.from("customers").update({
          name: editing.customer_name || editing.customers?.name,
          company: editing.company || editing.customers?.company,
          document: editing.document || editing.customers?.document,
          phone: editing.phone || editing.customers?.phone,
          email: editing.email || editing.customers?.email,
        }).eq("id", editing.customer_id);
        if (cuError) throw cuError;
      }
      const { error } = await supabase.from("sales").update({
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
        service_quantity: Number(editing.service_quantity || 1),
        notes: editing.notes || null,
        trello_link: null,
        google_drive_link: editing.google_drive_link || null,
        platform_link: editing.platform_link || null,
        lead_source: editing.lead_source || null,
        delivery_deadline: editing.delivery_deadline || null,
        expected_delivery_date: editing.expected_delivery_date || null,
        video_duration_seconds: editing.video_duration_seconds ? Number(editing.video_duration_seconds) : null,
      }).eq("id", editing.id);
      if (error) throw error;

      // Auto-vincular pasta da Plataforma com base no link
      try {
        await autoLinkFolderFromUrl(editing.platform_link || editing.google_drive_link, { saleId: editing.id });
      } catch (e) { /* não bloqueia o save */ }

      // Propagar link/produtor para as ordens de serviço existentes
      try {
        await supabase.from("service_orders").update({
          trello_link: null,
          producer_id: editing.producer_id || null,
          expected_delivery_date: editing.expected_delivery_date || null,
        }).eq("sale_id", editing.id);

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
        await logger.error(`Erro ao propagar edição: ${propErr?.message}`, { context: "sales/submitEdit/propagate", details: { error: propErr } });
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
          const { data: defCol } = await supabase.from("kanban_columns").select("id").eq("is_default", true).limit(1).maybeSingle();
          colId = defCol?.id;
          if (!colId) {
            const { data: firstCol } = await supabase.from("kanban_columns").select("id").order("sort_order").limit(1).maybeSingle();
            colId = firstCol?.id;
          }
          const custName = editing.customer_name || editing.customers?.name || "Cliente";
          const stName = (serviceTypes.data ?? []).find((st: any) => st.id === editing.service_type_id)?.name || "Serviço";
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
            for (let i = 0; i < (newQty - currentCount); i++) {
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
        await logger.error(`Erro ao acrescentar serviços: ${addErr?.message}`, { context: "sales/submitEdit/addServices", details: { error: addErr } });
      }

      toast.success("Venda atualizada");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      await logger.error(`Erro ao atualizar venda: ${e.message}`, { context: "sales/submitEdit", details: { editing, error: e } });
      toast.error(`Erro ao atualizar venda: ${e?.message ?? "tente novamente"}`);
    } finally { setEditSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div
        role="alert"
        className="rounded-md border border-amber-400/70 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2"
      >
        <span aria-hidden className="text-lg leading-none">⚠️</span>
        <div>
          <strong className="font-semibold">Atenção:</strong> confirme se a venda é{" "}
          <strong>Parcial</strong> ou <strong>Total</strong> para o sistema marcar o pagamento
          corretamente. Preencha <strong>todas as informações com cautela</strong> para evitar erros
          no faturamento, comissão e Kanban.
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Vendas</h1>
          <p className="text-muted-foreground">Cadastre e acompanhe todas as vendas</p>
        </div>
        <div className="flex items-center gap-2">
          {isGeneratingLink && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground mr-4">
              <Loader2 className="w-4 h-4 animate-spin" />
              Gerando link Pagar.me...
            </div>
          )}
          <div className="flex items-center bg-muted rounded-lg p-1 mr-2">
            <Button variant={viewMode === "table" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("table")}><List className="h-4 w-4" /></Button>
            <Button variant={viewMode === "card" ? "secondary" : "ghost"} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode("card")}><LayoutGrid className="h-4 w-4" /></Button>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="w-4 h-4 mr-2" />Nova Venda</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
              <DialogHeader className="relative overflow-hidden bg-gradient-to-br from-zinc-950 to-zinc-900 px-6 py-5 space-y-0">
                <div className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-30"
                  style={{ background: "radial-gradient(ellipse at right, hsl(var(--primary)/0.35), transparent 60%)" }} />
                <div className="relative flex items-center gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 border border-primary/30 shadow-[0_0_20px_hsl(var(--primary)/0.35)]">
                    <ShoppingCart className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <DialogTitle className="text-2xl font-bold text-white">
                      Nova <span className="text-primary">Venda</span>
                    </DialogTitle>
                    <p className="text-sm text-zinc-400 mt-0.5">Preencha os dados para registrar uma nova venda</p>
                  </div>
                </div>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-3 p-6">
                <div className="col-span-2">
                  <Label>Nome do cliente *</Label>
                  <Input list="customers-names" value={form.customer_name || ""} onChange={(e) => autofillFromCustomer("customer_name", e.target.value)} />
                  <datalist id="customers-names">{(customersAll.data ?? []).map((c: any) => optionText(c.name, "")).filter(Boolean).map((name: string, index: number) => (<option key={`n-${index}-${name}`} value={name} />))}</datalist>
                  {customerSuggestions.length > 0 && (
                    <div className="mt-2 rounded-md border border-border bg-muted/40 p-2 text-xs space-y-1">
                      <div className="text-muted-foreground">
                        {linkedCustomerId
                          ? "Usando dados de cliente já cadastrado:"
                          : `Já existe ${customerSuggestions.length === 1 ? "um cliente" : `${customerSuggestions.length} clientes`} com esse nome. Selecione para reutilizar, ou continue digitando para criar um novo (homônimo).`}
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {customerSuggestions.map((c: any) => (
                          <Button
                            key={c.id}
                            type="button"
                            size="sm"
                            variant={linkedCustomerId === c.id ? "default" : "outline"}
                            className="h-7 text-xs"
                            onClick={() => applyExistingCustomer(c)}
                          >
                            {c.name}
                            {c.company ? ` — ${c.company}` : ""}
                            {c.document ? ` (${c.document})` : ""}
                          </Button>
                        ))}
                        {linkedCustomerId && (
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            onClick={() => setLinkedCustomerId(null)}
                          >
                            Criar como novo cliente
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <div>
                  <Label>Empresa {form.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
                  <Input list="customers-companies" value={form.company || ""} onChange={(e) => autofillFromCustomer("company", e.target.value)} />
                  <datalist id="customers-companies">{(customersAll.data ?? []).map((c: any) => optionText(c.company, "")).filter(Boolean).map((company: string, index: number) => (<option key={`c-${index}-${company}`} value={company} />))}</datalist>
                </div>
                <div>
                  <Label>Com Nota? *</Label>
                  <SafeSelect
                    ariaLabel="Com Nota"
                    value={form.with_invoice || ""}
                    onValueChange={(v) => set("with_invoice", v)}
                    options={[
                      { value: "sim", label: "Sim (Com Nota)" },
                      { value: "nao", label: "Não (Sem Nota)" },
                    ]}
                  />
                </div>
                <div><Label>CPF/CNPJ {form.with_invoice === "sim" ? "*" : "(Opcional)"}</Label><Input value={form.document || ""} onChange={(e) => set("document", e.target.value)} /></div>
                <div><Label>Telefone *</Label><PhoneInputBR value={form.phone || ""} onChange={(v) => set("phone", v)} /></div>
                <div><Label>E-mail (opcional)</Label><Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>

                <div><Label>Valor total *</Label><Input type="number" step="0.01" value={form.total_amount || ""} onChange={(e) => set("total_amount", e.target.value)} /></div>
                <div><Label>Valor pago *</Label><Input type="number" step="0.01" value={form.paid_amount || ""} onChange={(e) => set("paid_amount", e.target.value)} /></div>
                <div>
                  <Label>Status pagamento *</Label>
                  <SafeSelect
                    ariaLabel="Status pagamento"
                    value={form.payment_status || ""}
                    onValueChange={(v) => set("payment_status", v)}
                    options={[
                      { value: "pago_total", label: "Pago total" },
                      { value: "pago_parcial", label: "Pago parcial" },
                      { value: "pendente", label: "Pendente" },
                    ]}
                  />
                </div>
                <div>
                  <Label>Forma de pagamento *</Label>
                  <SafeSelect
                    ariaLabel="Forma de pagamento"
                    value={form.payment_method || ""}
                    onValueChange={(v) => set("payment_method", v)}
                    options={[
                      { value: "pix", label: "Pix" },
                      { value: "cartao", label: "Cartão" },
                      { value: "boleto", label: "Boleto" },
                    ]}
                  />
                </div>
                {form.payment_method === "cartao" && (
                  <div>
                    <Label>Parcelas Máx. (Pagar.me)</Label>
                    <SafeSelect
                      ariaLabel="Parcelas máximas"
                      value={form.installments || ""}
                      onValueChange={(v) => set("installments", v)}
                      options={[1,2,3,4,5,6,7,8,9,10,11,12].map((n) => ({ value: String(n), label: `${n}x` }))}
                    />
                  </div>
                )}
                <div data-sale-field="seller_id">
                  <Label>Vendedor *</Label>
                  <SafeSelect
                    ariaLabel="Vendedor"
                    placeholder="—"
                    value={form.seller_id || ""}
                    onValueChange={(v) => set("seller_id", v)}
                    options={(sellers.data ?? [])
                      .filter((s: any) => !!optionValue(s.id))
                      .map((s: any) => ({ value: String(s.id), label: optionText(s.name) }))}
                  />
                </div>
                <div data-sale-field="producer_id">
                  <Label>Produtor *</Label>
                  <SafeSelect
                    ariaLabel="Produtor"
                    placeholder="—"
                    value={form.producer_id || ""}
                    onValueChange={(v) => set("producer_id", v)}
                    disabled={
                      (optionText(serviceTypes.data?.find(st => st.id === form.service_type_id)?.name, "").toLowerCase().includes("pamela") ||
                       optionText(serviceTypes.data?.find(st => st.id === form.service_type_id)?.name, "").toLowerCase().includes("ester") ||
                       optionText(sellers.data?.find(s => s.id === form.seller_id)?.name, "").toLowerCase().includes("pamela") ||
                       optionText(sellers.data?.find(s => s.id === form.seller_id)?.name, "").toLowerCase().includes("ester")) ?? false
                    }
                    options={(producers.data ?? [])
                      .filter((p: any) => !!optionValue(p.id))
                      .map((p: any) => ({ value: String(p.id), label: optionText(p.name) }))}
                  />
                </div>
                <div data-sale-field="service_type_id">
                  <Label>Tipo de serviço *</Label>
                  <SafeSelect
                    ariaLabel="Tipo de serviço"
                    placeholder="—"
                    value={form.service_type_id || ""}
                    onValueChange={(v) => set("service_type_id", v)}
                    options={(serviceTypes.data ?? [])
                      .filter((s: any) => !!optionValue(s.id))
                      .map((s: any) => ({ value: String(s.id), label: optionText(s.name) }))}
                  />
                  {!form.service_type_id && (
                    <p className="mt-1 text-[11px] text-muted-foreground">Escolha o tipo de serviço antes de confirmar.</p>
                  )}
                </div>
                <div>
                  <Label>Pacote (opcional)</Label>
                  <SafeSelect
                    ariaLabel="Pacote"
                    placeholder="—"
                    value={form.package_id || ""}
                    onValueChange={(v) => {
                      const p = (packages.data ?? []).find((x: any) => x.id === v);
                      set("package_id", v);
                      setForm((f) => ({ ...f, package_name: p?.name ?? f.package_name }));
                    }}
                    options={(packages.data ?? [])
                      .filter((p: any) => !!optionValue(p.id))
                      .map((p: any) => ({ value: String(p.id), label: optionText(p.name) }))}
                  />
                </div>
                <div><Label>Qtd. serviços *</Label><Input type="number" min="1" value={form.service_quantity || ""} onChange={(e) => set("service_quantity", e.target.value)} /></div>
                {formNeedsVideoDuration && (
                  <div data-sale-field="video_duration_seconds" className="rounded-md border border-amber-300/70 bg-amber-50/70 p-2 dark:bg-amber-950/20">
                    <Label>Minutagem do vídeo *</Label>
                    <SafeSelect
                      ariaLabel="Minutagem do vídeo"
                      placeholder="Selecione (mín. 30s)"
                      value={form.video_duration_seconds || ""}
                      onValueChange={(v) => set("video_duration_seconds", v)}
                      options={VIDEO_DURATION_OPTIONS.map((o) => ({ value: String(o.value), label: o.label }))}
                    />
                    <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">Obrigatório para vídeo/pacote. A pontuação é calculada por essa minutagem.</p>
                  </div>
                )}
                <div><Label>Data da venda *</Label><Input type="date" value={form.sale_date || ""} onChange={(e) => set("sale_date", e.target.value)} /></div>
                <div><Label>Data de entrega *</Label><Input type="date" value={form.expected_delivery_date || ""} onChange={(e) => set("expected_delivery_date", e.target.value)} /></div>
                <div className="col-span-2">
                  <Label>Origem da venda *</Label>
                  <SafeSelect
                    ariaLabel="Origem da venda"
                    placeholder="Selecione a origem"
                    value={form.lead_source || ""}
                    onValueChange={(v) => set("lead_source", v)}
                    options={[
                      { value: "cliente_recuperacao", label: "Cliente Recuperação" },
                      { value: "trafego_pago", label: "Tráfego Pago" },
                      { value: "indicacao", label: "Indicação" },
                      { value: "organico", label: "Orgânico / Redes Sociais" },
                      { value: "cliente_antigo", label: "Cliente Antigo" },
                      { value: "prospeccao", label: "Prospecção Ativa" },
                      { value: "outros", label: "Outros" },
                    ]}
                  />
                </div>
                <div className="col-span-2" data-sale-field="receipt">
                  <Label>Comprovante (imagem ou PDF) {formReceiptRecommended ? "(recomendado)" : "(opcional enquanto pendente)"}</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                  {receiptFile && <p className="text-xs text-muted-foreground mt-1">{receiptFile.name}</p>}
                </div>
                <div className="col-span-2"><Label>Prazo de entrega *</Label><Input placeholder="Ex: 7 dias úteis" value={form.delivery_deadline || ""} onChange={(e) => set("delivery_deadline", e.target.value)} /></div>
                <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
                <div className="col-span-2">
                  <Label>Link do Google Drive (opcional)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="https://drive.google.com/..." value={form.google_drive_link} onChange={(e) => set("google_drive_link", e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Drive</Button>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Link da Plataforma (pasta interna) (opcional)</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Cole aqui o link gerado no Chat Organizador" value={form.platform_link} onChange={(e) => set("platform_link", e.target.value)} />
                    <Button type="button" variant="outline" asChild>
                      <a href="/chat-organizador" target="_blank" rel="noreferrer">Abrir Chat</a>
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Opcional. Se quiser, informe um dos dois links (Drive ou Plataforma). Não precisa preencher os dois.</p>
                </div>
              </div>
              <DialogFooter className="px-6 pb-6">
                <Button onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {(form.payment_method === "pix" || form.payment_method === "cartao") ? "Confirmar Venda" : "Criar venda"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card className="border-border/50">
        <CardContent className="p-3 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
          <div className="col-span-2 md:col-span-2 lg:col-span-2 relative">
            <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-7 h-9" placeholder="Cliente, serviço, vendedor, produtor..." value={fSearch} onChange={(e) => setFSearch(e.target.value)} />
          </div>
          <Select value={fSeller} onValueChange={setFSeller}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Vendedor" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos vendedores</SelectItem>{(sellers.data ?? []).map((s: any) => optionValue(s.id) ? <SelectItem key={s.id} value={String(s.id)}>{optionText(s.name)}</SelectItem> : null)}</SelectContent>
          </Select>
          <Select value={fProducer} onValueChange={setFProducer}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Produtor" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos produtores</SelectItem>{(producers.data ?? []).map((p: any) => optionValue(p.id) ? <SelectItem key={p.id} value={String(p.id)}>{optionText(p.name)}</SelectItem> : null)}</SelectContent>
          </Select>
          <Select value={fService} onValueChange={setFService}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Serviço" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos serviços</SelectItem>{(serviceTypes.data ?? []).map((st: any) => optionValue(st.id) ? <SelectItem key={st.id} value={String(st.id)}>{optionText(st.name)}</SelectItem> : null)}</SelectContent>
          </Select>
          <Select value={fYear} onValueChange={setFYear}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Ano" /></SelectTrigger>
            <SelectContent><SelectItem value="all">Todos anos</SelectItem>{yearOptions.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={fMonth} onValueChange={setFMonth}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Mês" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos meses</SelectItem>
              {["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"].map((m, i) => (
                <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input type="date" className="h-9" value={fFrom} onChange={(e) => setFFrom(e.target.value)} title="De" />
          <Input type="date" className="h-9" value={fTo} onChange={(e) => setFTo(e.target.value)} title="Até" />
          <div className="col-span-2 md:col-span-4 lg:col-span-8 flex items-center justify-between text-xs text-muted-foreground">
            <span>{filteredSales.length} de {(salesList ?? []).length} vendas</span>
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-7" onClick={clearFilters}><X className="w-3 h-3 mr-1" />Limpar filtros</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {viewMode === "table" ? (
        <Card className="border-border/50" style={{ boxShadow: "var(--shadow-card)" }}>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Cliente</TableHead><TableHead>Serviço</TableHead><TableHead>Vendedor</TableHead><TableHead>Produtor</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Status</TableHead><TableHead className="w-12"></TableHead></TableRow></TableHeader>
              <TableBody>
                {loadingSales && (
                  <TableRow><TableCell colSpan={8} className="text-center py-12"><Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" /><p className="mt-2 text-sm text-muted-foreground">Carregando vendas...</p></TableCell></TableRow>
                )}
                {salesError && (
                  <TableRow><TableCell colSpan={8} className="text-center py-12 text-destructive"><p>Ocorreu um erro ao carregar as vendas.</p><p className="text-xs mt-1 mb-2">{(salesError as any)?.message || "Erro desconhecido"}</p><Button variant="outline" size="sm" className="mt-2" onClick={() => refetch()}>Tentar novamente</Button></TableCell></TableRow>
                )}
                {!loadingSales && !salesError && filteredSales.map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                    <TableCell><div className="font-semibold text-base">{s.customers?.company || "—"}</div><div className="text-xs text-muted-foreground">{s.customers?.name}</div></TableCell>
                    <TableCell>{s.service_types?.name ?? "—"}</TableCell><TableCell>{s.sellers?.name ?? "—"}</TableCell><TableCell>{s.producers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(s.total_amount)}</TableCell>
                    <TableCell><Badge variant={statusVariant(s.payment_status) as any}>{String(s.payment_status ?? "—").replace("_", " ")}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {(s.google_drive_link || s.trello_link) && (
                          <a
                            href={s.google_drive_link || s.trello_link}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir Google Drive"
                            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                        {s.platform_link && (
                          <a
                            href={s.platform_link}
                            target="_blank"
                            rel="noreferrer"
                            title="Abrir link da plataforma"
                            className="inline-flex items-center justify-center h-9 w-9 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950"
                          >
                            <Link2 className="w-4 h-4" />
                          </a>
                        )}
                        {s.payment_method === "cartao" && !s.pagarme_id && (
                          <Button size="icon" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Gerar Link Pagar.me" onClick={() => handleGenerateLink(s)}>
                            <Link2 className="w-4 h-4" />
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => setEditing({ ...s, with_invoice: s.customers?.document ? "sim" : "nao", customer_name: s.customers?.name, company: s.customers?.company, document: s.customers?.document, phone: s.customers?.phone, email: s.customers?.email })}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDelete(s.id)}><Trash2 className="w-4 h-4" /></Button>
                        {s.payment_status !== "pago_total" && (
                          <Button size="icon" variant="ghost" className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50" title="Confirmar Pagamento" onClick={() => handleQuickConfirm(s)}>
                            <Check className="w-4 h-4" />
                          </Button>
                        )}
                        <Dialog>
                          <DialogTrigger asChild><Button size="icon" variant="ghost"><Eye className="w-4 h-4" /></Button></DialogTrigger>
                          <DialogContent className="max-w-xl">
                            <DialogHeader><DialogTitle>Histórico de Pagamentos e Comprovantes</DialogTitle></DialogHeader>
                            <div className="space-y-4 py-4">
                              <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.company || "—"}</h3><p className="text-xs text-muted-foreground">{s.customers?.name}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                              <Tabs defaultValue="receipts" className="w-full">
                                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                                <TabsContent value="receipts" className="mt-4">
                                  {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                    <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                  ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                                </TabsContent>
                                <TabsContent value="history" className="mt-4">
                                  <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{String(s.payment_status ?? "—").replace("_", " ")}</Badge></div><div className="grid grid-cols-2 gap-2">{s.delivery_deadline && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Prazo de Entrega</p><p className="text-sm">{s.delivery_deadline}</p></div>)}{s.expected_delivery_date && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Data de Entrega</p><p className="text-sm">{fmtDate(s.expected_delivery_date)}</p></div>)}</div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
                                </TabsContent>
                              </Tabs>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loadingSales && !salesError && filteredSales.length === 0 && (<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma venda cadastrada ainda</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingSales && <div className="col-span-full py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /><p className="mt-4 text-muted-foreground">Carregando...</p></div>}
          {salesError && <div className="col-span-full py-20 text-center text-destructive"><p>Erro ao carregar vendas.</p><Button variant="outline" className="mt-4" onClick={() => qc.invalidateQueries({ queryKey: ["sales-list"] })}>Tentar novamente</Button></div>}
          {!loadingSales && !salesError && filteredSales.map((s: any) => (
            <Card key={s.id} className="border-border/50 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start"><div><h3 className="font-bold text-lg leading-tight">{s.customers?.company || "—"}</h3><p className="text-xs text-muted-foreground">{s.customers?.name}</p></div><Badge variant={statusVariant(s.payment_status) as any}>{String(s.payment_status ?? "—").replace("_", " ")}</Badge></div>
                  <div className="grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">Serviço</p><p className="font-medium truncate">{s.service_types?.name ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Data</p><p className="font-medium">{fmtDate(s.sale_date)}</p></div><div><p className="text-xs text-muted-foreground">Vendedor</p><p className="font-medium truncate">{s.sellers?.name ?? "—"}</p></div><div><p className="text-xs text-muted-foreground">Produtor</p><p className="font-medium truncate">{s.producers?.name ?? "—"}</p></div></div>
                  <div className="pt-2 border-t flex justify-between items-center"><div><p className="text-xs text-muted-foreground">Valor Total</p><p className="text-lg font-bold text-primary">{formatCurrency(s.total_amount)}</p></div>
                    <div className="flex gap-1">
                      {s.payment_method === "cartao" && !s.pagarme_id && (
                        <Button size="icon" variant="outline" className="h-8 w-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50" title="Gerar Link Pagar.me" onClick={() => handleGenerateLink(s)}>
                          <Link2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setEditing({ ...s, with_invoice: s.customers?.document ? "sim" : "nao", customer_name: s.customers?.name, company: s.customers?.company, document: s.customers?.document, phone: s.customers?.phone, email: s.customers?.email })}><Pencil className="w-4 h-4" /></Button>
                      <Button size="icon" variant="outline" className="h-8 w-8 text-destructive border-destructive/10 hover:bg-destructive/5" onClick={() => handleDelete(s.id)}><Trash2 className="w-4 h-4" /></Button>
                      {s.payment_status !== "pago_total" && (
                        <Button size="icon" variant="outline" className="h-8 w-8 text-emerald-600 border-emerald-100 hover:bg-emerald-50" title="Confirmar Pagamento" onClick={() => handleQuickConfirm(s)}>
                          <Check className="w-4 h-4" />
                        </Button>
                      )}
                      <Dialog>
                        <DialogTrigger asChild><Button size="icon" variant="outline" className="h-8 w-8"><Eye className="w-4 h-4" /></Button></DialogTrigger>
                        <DialogContent className="max-w-xl">
                          <DialogHeader><DialogTitle>Histórico de Pagamentos e Comprovantes</DialogTitle></DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.company || "—"}</h3><p className="text-xs text-muted-foreground">{s.customers?.name}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                            <Tabs defaultValue="receipts" className="w-full">
                              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                              <TabsContent value="receipts" className="mt-4">
                                {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                  <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                              </TabsContent>
                              <TabsContent value="history" className="mt-4">
                                <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{String(s.payment_status ?? "—").replace("_", " ")}</Badge></div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
                              </TabsContent>
                            </Tabs>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
                {filteredSales.length === 0 && (<div className="col-span-full py-12 text-center text-muted-foreground italic">Nenhuma venda cadastrada ainda</div>)}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar venda</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome do cliente *</Label>
                <Input list="edit-customers-names" value={editing.customer_name ?? editing.customers?.name ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, customer_name: e.target.value }))} />
              <datalist id="edit-customers-names">{(customersAll.data ?? []).map((c: any) => optionText(c.name, "")).filter(Boolean).map((name: string, index: number) => (<option key={`en-${index}-${name}`} value={name} />))}</datalist>
              </div>
              <div>
                <Label>Empresa {editing.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
                <Input list="edit-customers-companies" value={editing.company ?? editing.customers?.company ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, company: e.target.value }))} />
                <datalist id="edit-customers-companies">{(customersAll.data ?? []).map((c: any) => optionText(c.company, "")).filter(Boolean).map((company: string, index: number) => (<option key={`ec-${index}-${company}`} value={company} />))}</datalist>
              </div>
              <div>
                <Label>Com Nota? *</Label>
                <Select value={editing.with_invoice || (editing.document ? "sim" : "nao")} onValueChange={(v) => setEditing((prev: any) => ({ ...prev, with_invoice: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sim">Sim (Com Nota)</SelectItem>
                    <SelectItem value="nao">Não (Sem Nota)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>CPF/CNPJ {editing.with_invoice === "sim" ? "*" : "(Opcional)"}</Label><Input value={editing.document ?? editing.customers?.document ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, document: e.target.value }))} /></div>
              <div><Label>Telefone *</Label><PhoneInputBR value={editing.phone ?? editing.customers?.phone ?? ""} onChange={(v) => setEditing((prev: any) => ({ ...prev, phone: v }))} /></div>
              <div><Label>E-mail (opcional)</Label><Input value={editing.email ?? editing.customers?.email ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, email: e.target.value }))} /></div>
              <div><Label>Valor total *</Label><Input type="number" step="0.01" value={editing.total_amount ?? ""} onChange={(e) => editSet("total_amount", e.target.value)} /></div>
              <div><Label>Valor pago *</Label><Input type="number" step="0.01" value={editing.paid_amount ?? ""} onChange={(e) => editSet("paid_amount", e.target.value)} /></div>
              <div>
                <Label>Status pagamento *</Label>
                <Select value={editing.payment_status} onValueChange={(v) => editSet("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="pago_total">Pago total</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pendente">Pendente</SelectItem></SelectContent>
                </Select>
              </div>
              <div>
                <Label>Forma de pagamento *</Label>
                <Select value={editing.payment_method ?? ""} onValueChange={(v) => editSet("payment_method", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="cartao">Cartão</SelectItem><SelectItem value="boleto">Boleto</SelectItem></SelectContent>
                </Select>
              </div>
              {editing.payment_method === "cartao" && (
                <div>
                  <Label>Parcelas Máx. (Pagar.me)</Label>
                  <Select value={editing.installments || "12"} onValueChange={(v) => editSet("installments", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                        <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div>
                <Label>Vendedor *</Label>
                <Select value={editing.seller_id ?? ""} onValueChange={(v) => editSet("seller_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(sellers.data ?? []).map((s: any) => optionValue(s.id) ? <SelectItem key={s.id} value={String(s.id)}>{optionText(s.name)}</SelectItem> : null)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produtor *</Label>
                <Select 
                  value={editing.producer_id ?? ""} 
                  onValueChange={(v) => editSet("producer_id", v)}
                  disabled={
                    (optionText(serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name, "").toLowerCase().includes("pamela") ||
                     optionText(serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name, "").toLowerCase().includes("ester") ||
                     optionText(sellers.data?.find(s => s.id === editing.seller_id)?.name, "").toLowerCase().includes("pamela") ||
                     optionText(sellers.data?.find(s => s.id === editing.seller_id)?.name, "").toLowerCase().includes("ester")) ?? false
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(producers.data ?? []).map((p: any) => optionValue(p.id) ? <SelectItem key={p.id} value={String(p.id)}>{optionText(p.name)}</SelectItem> : null)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de serviço *</Label>
                <Select value={editing.service_type_id ?? ""} onValueChange={(v) => editSet("service_type_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(serviceTypes.data ?? []).map((s: any) => optionValue(s.id) ? <SelectItem key={s.id} value={String(s.id)}>{optionText(s.name)}</SelectItem> : null)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pacote (opcional)</Label>
                <Select value={editing.package_id ?? ""} onValueChange={(v) => {
                  const p = (packages.data ?? []).find((x: any) => x.id === v);
                  setEditing((prev: any) => ({ ...prev, package_id: v, package_name: p?.name ?? prev.package_name }));
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(packages.data ?? []).length === 0 ? (<div className="px-3 py-4 text-xs text-muted-foreground">Nenhum pacote cadastrado.</div>) : (packages.data ?? []).map((p: any) => optionValue(p.id) ? <SelectItem key={p.id} value={String(p.id)}>{optionText(p.name)}</SelectItem> : null)}</SelectContent>
                </Select>
              </div>
              <div><Label>Qtd. serviços *</Label><Input type="number" min="1" value={editing.service_quantity ?? 1} onChange={(e) => editSet("service_quantity", e.target.value)} /></div>
              {isVideoService(serviceTypes.data?.find((st: any) => st.id === editing.service_type_id)?.name, !!editing.package_id) && (
                <div>
                  <Label>Minutagem do vídeo *</Label>
                  <Select value={String(editing.video_duration_seconds ?? "")} onValueChange={(v) => editSet("video_duration_seconds", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione (mín. 30s)" /></SelectTrigger>
                    <SelectContent>
                      {VIDEO_DURATION_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div><Label>Data da venda *</Label><Input type="date" value={editing.sale_date ?? ""} onChange={(e) => editSet("sale_date", e.target.value)} /></div>
              <div><Label>Data de entrega *</Label><Input type="date" value={editing.expected_delivery_date ?? ""} onChange={(e) => editSet("expected_delivery_date", e.target.value)} /></div>
              <div className="col-span-2">
                <Label>Origem da venda *</Label>
                <Select value={editing.lead_source ?? ""} onValueChange={(v) => editSet("lead_source", v)}>
                  <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                  <SelectContent><SelectItem value="cliente_recuperacao">Cliente Recuperação</SelectItem><SelectItem value="trafego_pago">Tráfego Pago</SelectItem><SelectItem value="indicacao">Indicação</SelectItem><SelectItem value="organico">Orgânico / Redes Sociais</SelectItem><SelectItem value="cliente_antigo">Cliente Antigo</SelectItem><SelectItem value="prospeccao">Prospecção Ativa</SelectItem><SelectItem value="outros">Outros</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="col-span-2"><Label>Prazo de entrega *</Label><Input placeholder="Ex: 7 dias úteis" value={editing.delivery_deadline ?? ""} onChange={(e) => editSet("delivery_deadline", e.target.value)} /></div>
              <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={editing.notes ?? ""} onChange={(e) => editSet("notes", e.target.value)} /></div>
              <div className="col-span-2">
                <Label>Link do Google Drive (opcional)</Label>
                <div className="flex gap-2">
                  <Input placeholder="https://drive.google.com/..." value={editing.google_drive_link ?? ""} onChange={(e) => editSet("google_drive_link", e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Drive</Button>
                </div>
              </div>
              <div className="col-span-2">
                <Label>Link da Plataforma (pasta interna) (opcional)</Label>
                <div className="flex gap-2">
                  <Input placeholder="Cole aqui o link gerado no Chat Organizador" value={editing.platform_link ?? ""} onChange={(e) => editSet("platform_link", e.target.value)} />
                  <Button type="button" variant="outline" asChild>
                    <a href="/chat-organizador" target="_blank" rel="noreferrer">Abrir Chat</a>
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground mt-1">Opcional. Se quiser, informe um dos dois links (Drive ou Plataforma). Não precisa preencher os dois.</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={editSaving}>
              {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {(editing?.payment_method === "pix" || editing?.payment_method === "cartao") ? "Confirmar e Salvar" : "Salvar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!paymentLinkData} onOpenChange={(open) => !open && setPaymentLinkData(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-emerald-600">
              <QrCode className="w-5 h-5" />
              Pagamento Gerado
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center space-y-6 py-4">
            <div className="p-4 bg-white rounded-2xl border-2 border-emerald-100 shadow-sm">
              <QRCodeSVG value={paymentLinkData?.url || ""} size={200} />
            </div>
            
            <div className="w-full space-y-2">
              <Label className="text-xs text-muted-foreground uppercase font-bold tracking-wider">Link de Pagamento</Label>
              <div className="flex items-center gap-2 p-3 bg-muted rounded-lg border group relative">
                <span className="text-sm truncate flex-1 font-medium">{paymentLinkData?.url}</span>
                <Button 
                  size="icon" 
                  variant="ghost" 
                  className="h-8 w-8 hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                  onClick={() => {
                    navigator.clipboard.writeText(paymentLinkData?.url || "");
                    toast.success("Link copiado!");
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 h-11 text-base font-bold shadow-lg shadow-emerald-200" onClick={() => window.open(paymentLinkData?.url, "_blank")}>
              <ExternalLink className="w-4 h-4 mr-2" />
              Abrir Página de Pagamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
