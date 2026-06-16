import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
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
import { Plus, Loader2, Pencil, Eye, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { logger } from "@/lib/logger";
import { formatCurrency } from "@/lib/auth";
import { fmtDate } from "@/lib/format";
import { createPaymentLink } from "@/lib/pagarme.functions";
import { Copy, Link2, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

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

      // Auto-set producer for Pamela/Ester
      const checkInfluencer = () => {
        const selectedServiceType = serviceTypes.data?.find(st => st.id === (k === "service_type_id" ? v : f.service_type_id));
        const selectedSeller = sellers.data?.find(s => s.id === (k === "seller_id" ? v : f.seller_id));
        
        const serviceName = selectedServiceType?.name.toLowerCase() || "";
        const sellerName = selectedSeller?.name.toLowerCase() || "";
        
        if (serviceName.includes("pamela") || serviceName.includes("ester") || 
            sellerName.includes("pamela") || sellerName.includes("ester")) {
          const influencerProducer = producers.data?.find(p => p.name === "GRAVAÇÃO INFLUENCER");
          if (influencerProducer) updatedForm.producer_id = influencerProducer.id;
        }
      };

      if (k === "service_type_id" || k === "seller_id") {
        checkInfluencer();
      }
      
      return updatedForm;
    });
  }, [serviceTypes.data, sellers.data, producers.data]);

  const autofillFromCustomer = (field: "customer_name" | "company", value: string) => {
    setForm((f) => ({ ...f, [field]: value }));
    const list = customersAll.data ?? [];
    const v = value.trim().toLowerCase();
    if (!v) return;
    const match = list.find((c: any) =>
      field === "customer_name"
        ? (c.name ?? "").toLowerCase() === v
        : (c.company ?? "").toLowerCase() === v
    );
    if (match) {
      setForm((f) => ({
        ...f,
        customer_name: match.name ?? f.customer_name,
        company: match.company ?? f.company,
        document: match.document ?? f.document,
        phone: match.phone ?? f.phone,
        email: match.email ?? f.email,
      }));
    }
  };

  const submit = async () => {
    if (saving) return; // Prevent double clicks
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
        toast.error("Preencha o campo: Empresa (obrigatório para vendas com nota)");
        return;
      }
    }

    if (form.with_invoice === "sim" && !form.document.trim()) {
      toast.error("Preencha o campo: CPF/CNPJ (obrigatório para vendas com nota)");
      return;
    }

    for (const [k, label] of required) {
      const val = String((form as any)[k] ?? "").trim();
      if (!val) {
        toast.error(`Preencha o campo: ${label}`);
        return;
      }
    }
    // At least one of the two links is required
    const gLink = form.google_drive_link.trim();
    const pLink = form.platform_link.trim();
    if (!gLink && !pLink) {
      toast.error("Informe o Link do Google Drive ou o Link da Plataforma (pelo menos um).");
      return;
    }
    if (gLink && !gLink.toLowerCase().startsWith("http")) {
      toast.error("Link do Google Drive inválido."); return;
    }
    if (pLink && !pLink.toLowerCase().startsWith("http")) {
      toast.error("Link da Plataforma inválido."); return;
    }
    // Minutagem obrigatória para vídeos / pacotes
    {
      const stName = serviceTypes.data?.find((st: any) => st.id === form.service_type_id)?.name;
      if (isVideoService(stName, !!form.package_id)) {
        const dur = Number(form.video_duration_seconds);
        if (!dur || dur < 30 || dur % 30 !== 0) {
          toast.error("Selecione a minutagem do vídeo (mínimo 30s).");
          return;
        }
      }
    }
    if (!receiptFile) { toast.error("Anexe o comprovante"); return; }
    setSaving(true);
    try {
      const list = customersAll.data ?? [];
      const existing = list.find((c: any) =>
        (c.name ?? "").toLowerCase() === form.customer_name.trim().toLowerCase() &&
        (c.company ?? "").toLowerCase() === form.company.trim().toLowerCase()
      );
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

      let receipt_url: string | null = null;
      if (receiptFile) {
        const ext = receiptFile.name.split(".").pop() || "bin";
        const path = `${user?.id ?? "anon"}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: ue } = await supabase.storage.from("receipts").upload(path, receiptFile, {
          contentType: receiptFile.type || undefined,
          upsert: false,
        });
        if (ue) throw ue;
        receipt_url = path;
      }

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
        trello_link: form.trello_link || null,
        lead_source: form.lead_source || null,
        receipt_url,
        sale_date: form.sale_date || new Date().toISOString().slice(0, 10),
        delivery_deadline: form.delivery_deadline,
        expected_delivery_date: form.expected_delivery_date,
        video_duration_seconds: form.video_duration_seconds ? Number(form.video_duration_seconds) : null,
        created_by: user?.id,
      }).select("id").single();

      if (se) throw se;

      // Se houver comprovante, vincula
      if (receipt_url && saleRow?.id) {
        await supabase.from("sale_receipts").insert({
          sale_id: saleRow.id,
          file_path: receipt_url,
          amount: Number(form.paid_amount || 0),
          paid_at: form.sale_date || new Date().toISOString().slice(0, 10),
          uploaded_by: user?.id ?? null,
          notes: "Comprovante inicial",
        });
      }

      toast.success("Venda criada — cards de produção gerados automaticamente");
      setOpen(false);
      setForm({
        customer_name: "", company: "", document: "", phone: "", email: "",
        total_amount: "", paid_amount: "0", payment_status: "pago_total",
        payment_method: "pix", seller_id: "", producer_id: "", service_type_id: "",
        package_id: "", package_name: "", service_quantity: "1", notes: "", trello_link: "",
        sale_date: new Date().toISOString().slice(0, 10), lead_source: "",
        with_invoice: "sim",
        installments: "12",
        delivery_deadline: "",
        expected_delivery_date: new Date().toISOString().slice(0, 10),
        video_duration_seconds: "",
      });
      setReceiptFile(null);
      await qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      await logger.error(`Erro ao criar venda: ${e.message}`, { context: "sales/submit", details: { form, error: e } });
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Tem certeza que deseja excluir esta venda? Esta ação não pode ser desfeita.")) return;
    
    try {
      const { error } = await supabase.from("sales").delete().eq("id", id);
      if (error) throw error;
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
        
        const serviceName = selectedServiceType?.name.toLowerCase() || "";
        const sellerName = selectedSeller?.name.toLowerCase() || "";
        
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
      if (!val) {
        toast.error(`Preencha o campo: ${label}`);
        return;
      }
      if (k === "trello_link" && !val.toLowerCase().match(/^https:\/\/drive\.google\.com\//)) {
        toast.error("O link deve ser um link de compartilhamento válido do Google Drive (ex: https://drive.google.com/...)");
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
        trello_link: editing.trello_link || null,
        lead_source: editing.lead_source || null,
        delivery_deadline: editing.delivery_deadline || null,
        expected_delivery_date: editing.expected_delivery_date || null,
        video_duration_seconds: editing.video_duration_seconds ? Number(editing.video_duration_seconds) : null,
      }).eq("id", editing.id);
      if (error) throw error;

      toast.success("Venda atualizada");
      setEditing(null);
      await qc.invalidateQueries({ queryKey: ["sales-list"] });
    } catch (e: any) {
      await logger.error(`Erro ao atualizar venda: ${e.message}`, { context: "sales/submitEdit", details: { editing, error: e } });
    } finally { setEditSaving(false); }
  };

  return (
    <div className="space-y-6">
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
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle>Nova Venda</DialogTitle></DialogHeader>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label>Nome do cliente *</Label>
                  <Input list="customers-names" value={form.customer_name || ""} onChange={(e) => autofillFromCustomer("customer_name", e.target.value)} />
                  <datalist id="customers-names">{(customersAll.data ?? []).map((c: any) => (<option key={`n-${c.id}`} value={c.name} />))}</datalist>
                </div>
                <div>
                  <Label>Empresa {form.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
                  <Input list="customers-companies" value={form.company || ""} onChange={(e) => autofillFromCustomer("company", e.target.value)} />
                  <datalist id="customers-companies">{(customersAll.data ?? []).filter((c: any) => c.company).map((c: any) => (<option key={`c-${c.id}`} value={c.company} />))}</datalist>
                </div>
                <div>
                  <Label>Com Nota? *</Label>
                  <Select value={form.with_invoice || ""} onValueChange={(v) => set("with_invoice", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sim">Sim (Com Nota)</SelectItem>
                      <SelectItem value="nao">Não (Sem Nota)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>CPF/CNPJ {form.with_invoice === "sim" ? "*" : "(Opcional)"}</Label><Input value={form.document || ""} onChange={(e) => set("document", e.target.value)} /></div>
                <div><Label>Telefone *</Label><Input value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} /></div>
                <div><Label>E-mail (opcional)</Label><Input value={form.email || ""} onChange={(e) => set("email", e.target.value)} /></div>

                <div><Label>Valor total *</Label><Input type="number" step="0.01" value={form.total_amount || ""} onChange={(e) => set("total_amount", e.target.value)} /></div>
                <div><Label>Valor pago *</Label><Input type="number" step="0.01" value={form.paid_amount || ""} onChange={(e) => set("paid_amount", e.target.value)} /></div>
                <div>
                  <Label>Status pagamento *</Label>
                  <Select value={form.payment_status || ""} onValueChange={(v) => set("payment_status", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pago_total">Pago total</SelectItem><SelectItem value="pago_parcial">Pago parcial</SelectItem><SelectItem value="pendente">Pendente</SelectItem></SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Forma de pagamento *</Label>
                  <Select value={form.payment_method || ""} onValueChange={(v) => set("payment_method", v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="pix">Pix</SelectItem><SelectItem value="cartao">Cartão</SelectItem><SelectItem value="boleto">Boleto</SelectItem></SelectContent>
                  </Select>
                </div>
                {form.payment_method === "cartao" && (
                  <div>
                    <Label>Parcelas Máx. (Pagar.me)</Label>
                    <Select value={form.installments || ""} onValueChange={(v) => set("installments", v)}>
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
                  <Select value={form.seller_id || ""} onValueChange={(v) => set("seller_id", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Produtor *</Label>
                  <Select 
                    value={form.producer_id || ""} 
                    onValueChange={(v) => set("producer_id", v)}
                    disabled={
                      (serviceTypes.data?.find(st => st.id === form.service_type_id)?.name.toLowerCase().includes("pamela") ||
                       serviceTypes.data?.find(st => st.id === form.service_type_id)?.name.toLowerCase().includes("ester") ||
                       sellers.data?.find(s => s.id === form.seller_id)?.name.toLowerCase().includes("pamela") ||
                       sellers.data?.find(s => s.id === form.seller_id)?.name.toLowerCase().includes("ester")) ?? false
                    }
                  >
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Tipo de serviço *</Label>
                  <Select value={form.service_type_id || ""} onValueChange={(v) => set("service_type_id", v)}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pacote (opcional)</Label>
                  <Select value={form.package_id || ""} onValueChange={(v) => {
                    const p = (packages.data ?? []).find((x: any) => x.id === v);
                    setForm((f) => ({ ...f, package_id: v, package_name: p?.name ?? f.package_name }));
                  }}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {(packages.data ?? []).length === 0 ? (<div className="px-3 py-4 text-xs text-muted-foreground">Nenhum pacote cadastrado.</div>) : (packages.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Qtd. serviços *</Label><Input type="number" min="1" value={form.service_quantity || ""} onChange={(e) => set("service_quantity", e.target.value)} /></div>
                {isVideoService(serviceTypes.data?.find((st: any) => st.id === form.service_type_id)?.name, !!form.package_id) && (
                  <div>
                    <Label>Minutagem do vídeo *</Label>
                    <Select value={form.video_duration_seconds || ""} onValueChange={(v) => set("video_duration_seconds", v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione (mín. 30s)" /></SelectTrigger>
                      <SelectContent>
                        {VIDEO_DURATION_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div><Label>Data da venda *</Label><Input type="date" value={form.sale_date || ""} onChange={(e) => set("sale_date", e.target.value)} /></div>
                <div><Label>Data de entrega *</Label><Input type="date" value={form.expected_delivery_date || ""} onChange={(e) => set("expected_delivery_date", e.target.value)} /></div>
                <div className="col-span-2">
                  <Label>Origem da venda *</Label>
                  <Select value={form.lead_source || ""} onValueChange={(v) => set("lead_source", v)}>
                    <SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cliente_recuperacao">Cliente Recuperação</SelectItem><SelectItem value="trafego_pago">Tráfego Pago</SelectItem><SelectItem value="indicacao">Indicação</SelectItem><SelectItem value="organico">Orgânico / Redes Sociais</SelectItem><SelectItem value="cliente_antigo">Cliente Antigo</SelectItem><SelectItem value="prospeccao">Prospecção Ativa</SelectItem><SelectItem value="outros">Outros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Link Google Drive *</Label>
                  <div className="flex gap-2">
                    <Input placeholder="Cole o link do Google aqui" value={form.trello_link || ""} onChange={(e) => set("trello_link", e.target.value)} />
                    <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Google Drive</Button>
                  </div>
                </div>
                <div className="col-span-2">
                  <Label>Comprovante (imagem ou PDF) *</Label>
                  <Input type="file" accept="image/*,application/pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] ?? null)} />
                  {receiptFile && <p className="text-xs text-muted-foreground mt-1">{receiptFile.name}</p>}
                </div>
                <div className="col-span-2"><Label>Prazo de entrega *</Label><Input placeholder="Ex: 7 dias úteis" value={form.delivery_deadline || ""} onChange={(e) => set("delivery_deadline", e.target.value)} /></div>
                <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} /></div>
              </div>
              <DialogFooter>
                <Button onClick={submit} disabled={saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  {(form.payment_method === "pix" || form.payment_method === "cartao") ? "Confirmar Venda" : "Criar venda"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

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
                {!loadingSales && !salesError && (salesList ?? []).map((s: any) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">{fmtDate(s.sale_date)}</TableCell>
                    <TableCell><div className="font-medium">{s.customers?.name}</div><div className="text-xs text-muted-foreground">{s.customers?.company}</div></TableCell>
                    <TableCell>{s.service_types?.name ?? "—"}</TableCell><TableCell>{s.sellers?.name ?? "—"}</TableCell><TableCell>{s.producers?.name ?? "—"}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(s.total_amount)}</TableCell>
                    <TableCell><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
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
                              <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                              <Tabs defaultValue="receipts" className="w-full">
                                <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                                <TabsContent value="receipts" className="mt-4">
                                  {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                    <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                  ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                                </TabsContent>
                                <TabsContent value="history" className="mt-4">
                                  <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div><div className="grid grid-cols-2 gap-2">{s.delivery_deadline && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Prazo de Entrega</p><p className="text-sm">{s.delivery_deadline}</p></div>)}{s.expected_delivery_date && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Data de Entrega</p><p className="text-sm">{fmtDate(s.expected_delivery_date)}</p></div>)}</div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
                                </TabsContent>
                              </Tabs>
                            </div>
                          </DialogContent>
                        </Dialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {!loadingSales && !salesError && (salesList ?? []).length === 0 && (<TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Nenhuma venda cadastrada ainda</TableCell></TableRow>)}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingSales && <div className="col-span-full py-20 text-center"><Loader2 className="w-10 h-10 animate-spin mx-auto text-primary" /><p className="mt-4 text-muted-foreground">Carregando...</p></div>}
          {salesError && <div className="col-span-full py-20 text-center text-destructive"><p>Erro ao carregar vendas.</p><Button variant="outline" className="mt-4" onClick={() => qc.invalidateQueries({ queryKey: ["sales-list"] })}>Tentar novamente</Button></div>}
          {!loadingSales && !salesError && (salesList ?? []).map((s: any) => (
            <Card key={s.id} className="border-border/50 overflow-hidden hover:shadow-md transition-shadow">
              <CardContent className="p-0">
                <div className="p-4 space-y-3">
                  <div className="flex justify-between items-start"><div><h3 className="font-bold text-lg leading-tight">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div>
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
                            <div className="flex justify-between items-center pb-2 border-bottom"><div><h3 className="font-semibold text-lg">{s.customers?.name}</h3><p className="text-sm text-muted-foreground">{s.customers?.company}</p></div><div className="text-right"><p className="text-xs text-muted-foreground">Valor Total</p><p className="font-bold text-lg">{formatCurrency(s.total_amount)}</p></div></div>
                            <Tabs defaultValue="receipts" className="w-full">
                              <TabsList className="grid w-full grid-cols-2"><TabsTrigger value="receipts" className="flex gap-2"><FileText className="w-4 h-4" /> Comprovantes</TabsTrigger><TabsTrigger value="history" className="flex gap-2"><History className="w-4 h-4" /> Resumo</TabsTrigger></TabsList>
                              <TabsContent value="receipts" className="mt-4">
                                {s.sale_receipts && s.sale_receipts.length > 0 ? (
                                  <div className="space-y-3">{s.sale_receipts.map((r: any) => (<div key={r.id} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30"><div className="flex items-center gap-3"><div className="bg-green-100 p-2 rounded-full"><FileText className="w-4 h-4 text-green-700" /></div><div><p className="font-medium">{formatCurrency(r.amount)}</p><p className="text-xs text-muted-foreground">{fmtDate(r.paid_at)} {r.notes ? `• ${r.notes}` : ""}</p></div></div><Button variant="outline" size="sm" className="gap-2" onClick={async () => { const { data } = await supabase.storage.from("receipts").createSignedUrl(r.file_path, 3600); if (data?.signedUrl) window.open(data.signedUrl, "_blank"); else toast.error("Não foi possível gerar o link do comprovante"); }}><Download className="w-4 h-4" />Ver</Button></div>))}</div>
                                ) : (<div className="text-center py-8 text-muted-foreground italic">Nenhum comprovante anexado.</div>)}
                              </TabsContent>
                              <TabsContent value="history" className="mt-4">
                                <div className="space-y-3"><div className="grid grid-cols-2 gap-4"><div className="p-3 border rounded-lg bg-green-50"><p className="text-xs text-green-700 uppercase font-semibold">Total Pago</p><p className="text-xl font-bold text-green-800">{formatCurrency(s.paid_amount)}</p></div><div className="p-3 border rounded-lg bg-red-50"><p className="text-xs text-red-700 uppercase font-semibold">Pendente</p><p className="text-xl font-bold text-red-800">{formatCurrency(Number(s.total_amount) - Number(s.paid_amount))}</p></div></div><div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Status</p><Badge variant={statusVariant(s.payment_status) as any}>{s.payment_status.replace("_", " ")}</Badge></div>{s.notes && (<div className="p-3 border rounded-lg"><p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Observações da Venda</p><p className="text-sm">{s.notes}</p></div>)}</div>
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
                {(salesList ?? []).length === 0 && (<div className="col-span-full py-12 text-center text-muted-foreground italic">Nenhuma venda cadastrada ainda</div>)}
        </div>
      )}

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Editar venda</DialogTitle></DialogHeader>
          {editing && (
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <Label>Nome do cliente *</Label>
                <Input list="edit-customers-names" value={editing.customer_name ?? editing.customers?.name ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, customer_name: e.target.value }))} onBlur={(e) => {
                  const val = e.target.value.trim().toLowerCase();
                  if (!val) return;
                  const match = (customersAll.data ?? []).find((c: any) => (c.name ?? "").toLowerCase() === val);
                  if (match) {
                    setEditing((prev: any) => ({
                      ...prev,
                      customer_name: match.name,
                      company: match.company ?? prev.company,
                      document: match.document ?? prev.document,
                      phone: match.phone ?? prev.phone,
                      email: match.email ?? prev.email,
                    }));
                  }
                }} />
                <datalist id="edit-customers-names">{(customersAll.data ?? []).map((c: any) => (<option key={`en-${c.id}`} value={c.name} />))}</datalist>
              </div>
              <div>
                <Label>Empresa {editing.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
                <Input list="edit-customers-companies" value={editing.company ?? editing.customers?.company ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, company: e.target.value }))} onBlur={(e) => {
                  const val = e.target.value.trim().toLowerCase();
                  if (!val) return;
                  const match = (customersAll.data ?? []).find((c: any) => (c.company ?? "").toLowerCase() === val);
                  if (match) {
                    setEditing((prev: any) => ({
                      ...prev,
                      customer_name: match.name ?? prev.customer_name,
                      company: match.company,
                      document: match.document ?? prev.document,
                      phone: match.phone ?? prev.phone,
                      email: match.email ?? prev.email,
                    }));
                  }
                }} />
                <datalist id="edit-customers-companies">{(customersAll.data ?? []).filter((c: any) => c.company).map((c: any) => (<option key={`ec-${c.id}`} value={c.company} />))}</datalist>
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
              <div><Label>Telefone *</Label><Input value={editing.phone ?? editing.customers?.phone ?? ""} onChange={(e) => setEditing((prev: any) => ({ ...prev, phone: e.target.value }))} /></div>
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
                  <SelectContent>{(sellers.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Produtor *</Label>
                <Select 
                  value={editing.producer_id ?? ""} 
                  onValueChange={(v) => editSet("producer_id", v)}
                  disabled={
                    (serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name.toLowerCase().includes("pamela") ||
                     serviceTypes.data?.find(st => st.id === editing.service_type_id)?.name.toLowerCase().includes("ester") ||
                     sellers.data?.find(s => s.id === editing.seller_id)?.name.toLowerCase().includes("pamela") ||
                     sellers.data?.find(s => s.id === editing.seller_id)?.name.toLowerCase().includes("ester")) ?? false
                  }
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(producers.data ?? []).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Tipo de serviço *</Label>
                <Select value={editing.service_type_id ?? ""} onValueChange={(v) => editSet("service_type_id", v)}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(serviceTypes.data ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Pacote (opcional)</Label>
                <Select value={editing.package_id ?? ""} onValueChange={(v) => {
                  const p = (packages.data ?? []).find((x: any) => x.id === v);
                  setEditing((prev: any) => ({ ...prev, package_id: v, package_name: p?.name ?? prev.package_name }));
                }}>
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>{(packages.data ?? []).length === 0 ? (<div className="px-3 py-4 text-xs text-muted-foreground">Nenhum pacote cadastrado.</div>) : (packages.data ?? []).map((p: any) => (<SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>))}</SelectContent>
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
              <div className="col-span-2">
                <Label>Link Google Drive *</Label>
                <div className="flex gap-2">
                  <Input placeholder="Cole o link do Google aqui" value={editing.trello_link ?? ""} onChange={(e) => editSet("trello_link", e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => window.open("https://drive.google.com/drive/u/0/home", "_blank", "noopener,noreferrer")}>Abrir Google Drive</Button>
                </div>
              </div>
              <div className="col-span-2"><Label>Prazo de entrega *</Label><Input placeholder="Ex: 7 dias úteis" value={editing.delivery_deadline ?? ""} onChange={(e) => editSet("delivery_deadline", e.target.value)} /></div>
              <div className="col-span-2"><Label>Observações (opcional)</Label><Textarea value={editing.notes ?? ""} onChange={(e) => editSet("notes", e.target.value)} /></div>
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
