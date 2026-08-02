import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Plus, Loader2, Check, ShoppingCart } from "lucide-react";
import {
  User,
  Building2,
  Badge as BadgeIcon,
  Phone as _Phone,
  Mail,
  DollarSign,
  Layers,
  Calendar,
  MessageSquare,
  Link as LinkIcon,
  Upload as UploadIcon,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { PhoneInputBR } from "@/components/phone-input-br";
import { SafeSelect } from "@/components/safe-select";
import type { CustomerRecord, LookupOption, SaleFormState } from "./types";

const VIDEO_DURATION_OPTIONS: { value: number; label: string }[] = Array.from(
  { length: 20 },
  (_, i) => {
    const sec = (i + 1) * 30;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    const label = m === 0 ? `${s}s` : s === 0 ? `${m}min` : `${m}min${s}s`;
    return { value: sec, label };
  },
);

function optionText(value: unknown, fallback = "—") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function optionValue(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

export interface NewSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: SaleFormState;
  set: (key: string, value: string) => void;
  onPackageChange: (packageId: string) => void;
  customersAll: CustomerRecord[];
  customerSuggestions: CustomerRecord[];
  linkedCustomerId: string | null;
  onAutofillFromCustomer: (field: "customer_name" | "company", value: string) => void;
  onApplyExistingCustomer: (customer: CustomerRecord) => void;
  onClearLinkedCustomer: () => void;
  sellers: LookupOption[];
  producers: LookupOption[];
  serviceTypes: LookupOption[];
  packages: LookupOption[];
  producerLockedByInfluencer: boolean;
  formNeedsVideoDuration: boolean;
  formReceiptRecommended: boolean;
  receiptFile: File | null;
  onReceiptFileChange: (file: File | null) => void;
  saving: boolean;
  onSubmit: () => void;
}

export function NewSaleDialog({
  open,
  onOpenChange,
  form,
  set,
  onPackageChange,
  customersAll,
  customerSuggestions,
  linkedCustomerId,
  onAutofillFromCustomer,
  onApplyExistingCustomer,
  onClearLinkedCustomer,
  sellers,
  producers,
  serviceTypes,
  packages,
  producerLockedByInfluencer,
  formNeedsVideoDuration,
  formReceiptRecommended,
  receiptFile,
  onReceiptFileChange,
  saving,
  onSubmit,
}: NewSaleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="premium">
          <Plus className="w-4 h-4 mr-2" />
          Nova Venda
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[calc(100%-1rem)] sm:w-full max-w-[95vw] sm:max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0 border border-[#E8E8E8] dark:border-white/10 rounded-[18px] bg-white dark:bg-[#0B0B0D] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.35)] [&_input]:h-10 [&_input]:rounded-lg [&_input]:border-[#ECECEC] [&_input]:bg-white [&_input]:pl-9 [&_input]:text-sm [&_input]:transition-all [&_input]:duration-200 [&_input:hover]:border-[#E30613]/60 [&_input:focus]:border-[#E30613] [&_input:focus]:ring-2 [&_input:focus]:ring-[#E30613]/15 dark:[&_input]:bg-white/[0.03] dark:[&_input]:border-white/10 dark:[&_input]:text-white [&_[data-slot=select-trigger]]:h-10 [&_[data-slot=select-trigger]]:rounded-lg [&_[data-slot=select-trigger]]:border-[#ECECEC] [&_[data-slot=select-trigger]]:bg-white [&_[data-slot=select-trigger]]:pl-9 [&_[data-slot=select-trigger]:hover]:border-[#E30613]/60 [&_[data-slot=select-trigger]:focus]:border-[#E30613] [&_[data-slot=select-trigger]:focus]:ring-2 [&_[data-slot=select-trigger]:focus]:ring-[#E30613]/15 dark:[&_[data-slot=select-trigger]]:bg-white/[0.03] dark:[&_[data-slot=select-trigger]]:border-white/10 dark:[&_[data-slot=select-trigger]]:text-white [&_textarea]:rounded-lg [&_textarea]:border-[#ECECEC] [&_textarea]:bg-white [&_textarea]:transition-all [&_textarea:focus]:border-[#E30613] [&_textarea:focus]:ring-2 [&_textarea:focus]:ring-[#E30613]/15 dark:[&_textarea]:bg-white/[0.03] dark:[&_textarea]:border-white/10 dark:[&_textarea]:text-white [&_label]:text-[12px] [&_label]:font-medium [&_label]:text-neutral-700 dark:[&_label]:text-neutral-300">
        <DialogHeader className="relative overflow-hidden bg-[#0B0B0D] px-4 sm:px-6 py-4 space-y-0 border-b border-white/5">
          <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0 w-2/3">
            <div
              className="absolute inset-0 opacity-40"
              style={{
                background:
                  "radial-gradient(60% 100% at 100% 50%, rgba(227,6,19,0.35), transparent 65%)",
              }}
            />
            <svg
              className="absolute right-0 top-0 h-full w-full opacity-70"
              viewBox="0 0 400 200"
              fill="none"
              preserveAspectRatio="none"
            >
              <path
                d="M0 120 Q100 40 200 120 T400 100"
                stroke="#E30613"
                strokeWidth="1.2"
                fill="none"
                opacity="0.35"
              />
              <path
                d="M0 140 Q120 60 240 140 T400 120"
                stroke="#E30613"
                strokeWidth="0.8"
                fill="none"
                opacity="0.25"
              />
              <path
                d="M0 160 Q140 90 260 160 T400 150"
                stroke="#E30613"
                strokeWidth="0.6"
                fill="none"
                opacity="0.2"
              />
            </svg>
          </div>
          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-gradient-to-br from-[#E30613] to-[#B00510] shadow-[0_0_25px_rgba(227,6,19,0.5)] ring-1 ring-white/10">
              <ShoppingCart className="h-5 w-5 text-white" strokeWidth={2.2} />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-white tracking-tight">
                Nova <span className="text-[#E30613]">Venda</span>
              </DialogTitle>
              <p className="text-xs text-neutral-400 mt-0.5">
                Cadastre uma nova venda em poucos segundos.
              </p>
            </div>
          </div>
        </DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 p-4 sm:p-5 bg-[#FAFAFA] dark:bg-[#0B0B0D]">
          <div className="md:col-span-2">
            <Label>Nome do cliente *</Label>
            <div className="relative mt-1.5">
              <User className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                list="customers-names"
                placeholder="Digite o nome do cliente"
                value={form.customer_name || ""}
                onChange={(e) => onAutofillFromCustomer("customer_name", e.target.value)}
              />
            </div>
            <datalist id="customers-names">
              {(customersAll ?? [])
                .map((c) => optionText(c.name, ""))
                .filter(Boolean)
                .map((name: string, index: number) => (
                  <option key={`n-${index}-${name}`} value={name} />
                ))}
            </datalist>
            {customerSuggestions.length > 0 && (
              <div className="mt-2 rounded-xl border border-[#E8E8E8] bg-white dark:border-white/10 dark:bg-white/[0.02] p-3 text-xs space-y-1.5">
                <div className="text-muted-foreground">
                  {linkedCustomerId
                    ? "Usando dados de cliente já cadastrado:"
                    : `Já existe ${customerSuggestions.length === 1 ? "um cliente" : `${customerSuggestions.length} clientes`} com esse nome. Selecione para reutilizar, ou continue digitando para criar um novo (homônimo).`}
                </div>
                <div className="flex flex-wrap gap-1">
                  {customerSuggestions.map((c) => (
                    <Button
                      key={c.id}
                      type="button"
                      size="sm"
                      variant={linkedCustomerId === c.id ? "default" : "outline"}
                      className="h-7 text-xs"
                      onClick={() => onApplyExistingCustomer(c)}
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
                      onClick={onClearLinkedCustomer}
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
            <div className="relative mt-1.5">
              <Building2 className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                list="customers-companies"
                placeholder="Nome da empresa"
                value={form.company || ""}
                onChange={(e) => onAutofillFromCustomer("company", e.target.value)}
              />
            </div>
            <datalist id="customers-companies">
              {(customersAll ?? [])
                .map((c) => optionText(c.company, ""))
                .filter(Boolean)
                .map((company: string, index: number) => (
                  <option key={`c-${index}-${company}`} value={company} />
                ))}
            </datalist>
          </div>
          <div>
            <Label>Com Nota? *</Label>
            <div className="mt-1.5">
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
          </div>
          <div>
            <Label>CPF/CNPJ {form.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
            <div className="relative mt-1.5">
              <BadgeIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="00.000.000/0000-00"
                value={form.document || ""}
                onChange={(e) => set("document", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Telefone *</Label>
            <div className="relative mt-1.5 [&_input]:pl-3">
              <PhoneInputBR value={form.phone || ""} onChange={(v) => set("phone", v)} />
            </div>
          </div>
          <div>
            <Label>E-mail (opcional)</Label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="exemplo@email.com"
                value={form.email || ""}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Valor total *</Label>
            <div className="relative mt-1.5">
              <DollarSign className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.total_amount || ""}
                onChange={(e) => set("total_amount", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Valor pago *</Label>
            <div className="relative mt-1.5">
              <DollarSign className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={form.paid_amount || ""}
                onChange={(e) => set("paid_amount", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Status pagamento *</Label>
            <div className="mt-1.5">
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
          </div>
          <div>
            <Label>Forma de pagamento *</Label>
            <div className="mt-1.5">
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
          </div>
          {form.payment_method === "cartao" && (
            <div>
              <Label>Parcelas Máx. (Pagar.me)</Label>
              <div className="mt-1.5">
                <SafeSelect
                  ariaLabel="Parcelas máximas"
                  value={form.installments || ""}
                  onValueChange={(v) => set("installments", v)}
                  options={[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({
                    value: String(n),
                    label: `${n}x`,
                  }))}
                />
              </div>
            </div>
          )}
          <div data-sale-field="seller_id">
            <Label>Vendedor *</Label>
            <div className="mt-1.5">
              <SafeSelect
                ariaLabel="Vendedor"
                placeholder="—"
                value={form.seller_id || ""}
                onValueChange={(v) => set("seller_id", v)}
                options={(sellers ?? [])
                  .filter((s) => !!optionValue(s.id))
                  .map((s) => ({ value: String(s.id), label: optionText(s.name) }))}
              />
            </div>
          </div>
          <div data-sale-field="producer_id">
            <Label>Produtor *</Label>
            <div className="mt-1.5">
              <SafeSelect
                ariaLabel="Produtor"
                placeholder="—"
                value={form.producer_id || ""}
                onValueChange={(v) => set("producer_id", v)}
                disabled={producerLockedByInfluencer}
                options={(producers ?? [])
                  .filter((p) => !!optionValue(p.id))
                  .map((p) => ({ value: String(p.id), label: optionText(p.name) }))}
              />
            </div>
          </div>
          <div data-sale-field="service_type_id">
            <Label>Tipo de serviço *</Label>
            <div className="mt-1.5">
              <SafeSelect
                ariaLabel="Tipo de serviço"
                placeholder="—"
                value={form.service_type_id || ""}
                onValueChange={(v) => set("service_type_id", v)}
                options={(serviceTypes ?? [])
                  .filter((s) => !!optionValue(s.id))
                  .map((s) => ({ value: String(s.id), label: optionText(s.name) }))}
              />
            </div>
            {!form.service_type_id && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Escolha o tipo de serviço antes de confirmar.
              </p>
            )}
          </div>
          <div>
            <Label>Pacote (opcional)</Label>
            <div className="mt-1.5">
              <SafeSelect
                ariaLabel="Pacote"
                placeholder="—"
                value={form.package_id || ""}
                onValueChange={onPackageChange}
                options={(packages ?? [])
                  .filter((p) => !!optionValue(p.id))
                  .map((p) => ({ value: String(p.id), label: optionText(p.name) }))}
              />
            </div>
          </div>
          <div>
            <Label>Qtd. serviços *</Label>
            <div className="relative mt-1.5">
              <Layers className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="number"
                min="1"
                value={form.service_quantity || ""}
                onChange={(e) => set("service_quantity", e.target.value)}
              />
            </div>
          </div>
          {formNeedsVideoDuration && (
            <div
              data-sale-field="video_duration_seconds"
              className="rounded-xl border border-amber-300/70 bg-amber-50/70 p-3 dark:bg-amber-950/20"
            >
              <Label>Minutagem do vídeo *</Label>
              <div className="mt-1.5">
                <SafeSelect
                  ariaLabel="Minutagem do vídeo"
                  placeholder="Selecione (mín. 30s)"
                  value={form.video_duration_seconds || ""}
                  onValueChange={(v) => set("video_duration_seconds", v)}
                  options={VIDEO_DURATION_OPTIONS.map((o) => ({
                    value: String(o.value),
                    label: o.label,
                  }))}
                />
              </div>
              <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">
                Obrigatório para vídeo/pacote. A pontuação é calculada por essa minutagem.
              </p>
            </div>
          )}
          <div>
            <Label>Data da venda *</Label>
            <div className="relative mt-1.5">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="date"
                value={form.sale_date || ""}
                onChange={(e) => set("sale_date", e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label>Data de entrega *</Label>
            <div className="relative mt-1.5">
              <Calendar className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                type="date"
                value={form.expected_delivery_date || ""}
                onChange={(e) => set("expected_delivery_date", e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Origem da venda *</Label>
            <div className="mt-1.5">
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
          </div>
          <div className="md:col-span-2" data-sale-field="receipt">
            <Label>
              Comprovante (imagem ou PDF){" "}
              {formReceiptRecommended ? "(recomendado)" : "(opcional enquanto pendente)"}
            </Label>
            <label className="group relative mt-1.5 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E30613]/40 bg-gradient-to-b from-[#FFF5F6] to-white p-4 text-center transition-all duration-300 hover:border-[#E30613] hover:shadow-[0_10px_40px_-10px_rgba(227,6,19,0.35)] dark:from-white/[0.03] dark:to-transparent">
              <input
                type="file"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => onReceiptFileChange(e.target.files?.[0] ?? null)}
              />
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#E30613] to-[#B00510] shadow-[0_10px_30px_-5px_rgba(227,6,19,0.5)] transition-transform duration-300 group-hover:scale-105">
                <UploadIcon className="h-4 w-4 text-white" strokeWidth={2.2} />
              </div>
              {receiptFile ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100 flex items-center gap-2">
                    <Check className="h-4 w-4 text-emerald-600" /> {receiptFile.name}
                  </p>
                  <p className="text-xs text-neutral-500">
                    {(receiptFile.size / 1024).toFixed(0)} KB
                  </p>
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-[#E30613] hover:underline"
                    onClick={(ev) => {
                      ev.preventDefault();
                      ev.stopPropagation();
                      onReceiptFileChange(null);
                    }}
                  >
                    Remover arquivo
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-neutral-800 dark:text-neutral-100">
                    Clique ou arraste seu comprovante
                  </p>
                  <p className="text-xs text-neutral-500">PNG · JPG · PDF · até 10MB</p>
                </>
              )}
            </label>
          </div>
          <div className="md:col-span-2">
            <Label>Prazo de entrega *</Label>
            <div className="relative mt-1.5">
              <Clock className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
              <Input
                placeholder="Ex: 7 dias úteis"
                value={form.delivery_deadline || ""}
                onChange={(e) => set("delivery_deadline", e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Observações (opcional)</Label>
            <div className="relative mt-1.5 [&_textarea]:pl-10 [&_textarea]:pt-3">
              <MessageSquare className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-neutral-400" />
              <Textarea
                placeholder="Adicione observações sobre esta venda..."
                value={form.notes || ""}
                onChange={(e) => set("notes", e.target.value)}
              />
            </div>
          </div>
          <div className="md:col-span-2">
            <Label>Link do Google Drive (opcional)</Label>
            <div className="mt-1.5 flex gap-2">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="https://drive.google.com/..."
                  value={form.google_drive_link}
                  onChange={(e) => set("google_drive_link", e.target.value)}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={() =>
                  window.open(
                    "https://drive.google.com/drive/u/0/home",
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Abrir Drive
              </Button>
            </div>
          </div>
          <div className="sm:col-span-2">
            <Label>Link da Plataforma (pasta interna) (opcional)</Label>
            <div className="mt-1.5 flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400" />
                <Input
                  placeholder="Cole aqui o link gerado no Chat Organizador"
                  value={form.platform_link}
                  onChange={(e) => set("platform_link", e.target.value)}
                />
              </div>
              <Button type="button" variant="outline" asChild>
                <a href="/chat-organizador" target="_blank" rel="noreferrer">
                  Abrir Chat
                </a>
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3" /> Opcional. Informe um dos dois links (Drive ou
              Plataforma).
            </p>
          </div>
        </div>
        <div className="border-t border-[#E8E8E8] dark:border-white/10 bg-white dark:bg-[#0B0B0D] px-4 sm:px-5 py-3 flex flex-col gap-2">
          <p className="text-[11px] text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Todos os dados são
            armazenados de forma segura.
          </p>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="w-full sm:w-auto h-10 rounded-lg px-4 border-[#E8E8E8] text-neutral-800 hover:bg-neutral-100 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/[0.05]"
            >
              Cancelar
            </Button>
            <Button
              onClick={onSubmit}
              disabled={saving}
              className="w-full sm:w-auto h-10 rounded-lg px-5 font-semibold text-white bg-gradient-to-r from-[#E30613] to-[#B00510] shadow-[0_10px_30px_-8px_rgba(227,6,19,0.6)] transition-all duration-300 hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-8px_rgba(227,6,19,0.7)] disabled:opacity-70"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Check className="w-4 h-4 mr-2" />
              )}
              {form.payment_method === "pix" || form.payment_method === "cartao"
                ? "Confirmar Venda"
                : "Criar venda"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
