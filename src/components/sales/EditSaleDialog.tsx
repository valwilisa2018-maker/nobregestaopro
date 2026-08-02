import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { PhoneInputBR } from "@/components/phone-input-br";
import type { CustomerRecord, EditingSale, LookupOption } from "./types";

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

// Detecta se o tipo de serviço selecionado é vídeo (qualquer nome contendo
// "video" / "vídeo") OU se a venda é de um pacote (pacotes são compostos
// por vídeos). Define se o campo "Minutagem" é obrigatório.
function isVideoService(serviceTypeName?: string, hasPackage?: boolean) {
  if (hasPackage) return true;
  const n = (serviceTypeName ?? "").toLowerCase();
  if (n.includes("video") || n.includes("vídeo")) return true;
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

export interface EditSaleDialogProps {
  editing: EditingSale | null;
  onOpenChange: (open: boolean) => void;
  onFieldChange: (patch: Partial<EditingSale>) => void;
  editSet: (key: string, value: any) => void;
  customersAll: CustomerRecord[];
  sellers: LookupOption[];
  producers: LookupOption[];
  serviceTypes: LookupOption[];
  packages: LookupOption[];
  editSaving: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

export function EditSaleDialog({
  editing,
  onOpenChange,
  onFieldChange,
  editSet,
  customersAll,
  sellers,
  producers,
  serviceTypes,
  packages,
  editSaving,
  onCancel,
  onSubmit,
}: EditSaleDialogProps) {
  const producerLocked =
    (optionText(
      serviceTypes.find((st) => st.id === editing?.service_type_id)?.name,
      "",
    )
      .toLowerCase()
      .includes("pamela") ||
      optionText(
        serviceTypes.find((st) => st.id === editing?.service_type_id)?.name,
        "",
      )
        .toLowerCase()
        .includes("ester") ||
      optionText(sellers.find((s) => s.id === editing?.seller_id)?.name, "")
        .toLowerCase()
        .includes("pamela") ||
      optionText(sellers.find((s) => s.id === editing?.seller_id)?.name, "")
        .toLowerCase()
        .includes("ester")) ??
    false;

  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar venda</DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome do cliente *</Label>
              <Input
                list="edit-customers-names"
                value={editing.customer_name ?? editing.customers?.name ?? ""}
                onChange={(e) => onFieldChange({ customer_name: e.target.value })}
              />
              <datalist id="edit-customers-names">
                {(customersAll ?? [])
                  .map((c) => optionText(c.name, ""))
                  .filter(Boolean)
                  .map((name: string, index: number) => (
                    <option key={`en-${index}-${name}`} value={name} />
                  ))}
              </datalist>
            </div>
            <div>
              <Label>Empresa {editing.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
              <Input
                list="edit-customers-companies"
                value={editing.company ?? editing.customers?.company ?? ""}
                onChange={(e) => onFieldChange({ company: e.target.value })}
              />
              <datalist id="edit-customers-companies">
                {(customersAll ?? [])
                  .map((c) => optionText(c.company, ""))
                  .filter(Boolean)
                  .map((company: string, index: number) => (
                    <option key={`ec-${index}-${company}`} value={company} />
                  ))}
              </datalist>
            </div>
            <div>
              <Label>Com Nota? *</Label>
              <Select
                value={editing.with_invoice || (editing.document ? "sim" : "nao")}
                onValueChange={(v) => onFieldChange({ with_invoice: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sim">Sim (Com Nota)</SelectItem>
                  <SelectItem value="nao">Não (Sem Nota)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CPF/CNPJ {editing.with_invoice === "sim" ? "*" : "(Opcional)"}</Label>
              <Input
                value={editing.document ?? editing.customers?.document ?? ""}
                onChange={(e) => onFieldChange({ document: e.target.value })}
              />
            </div>
            <div>
              <Label>Telefone *</Label>
              <PhoneInputBR
                value={editing.phone ?? editing.customers?.phone ?? ""}
                onChange={(v) => onFieldChange({ phone: v })}
              />
            </div>
            <div>
              <Label>E-mail (opcional)</Label>
              <Input
                value={editing.email ?? editing.customers?.email ?? ""}
                onChange={(e) => onFieldChange({ email: e.target.value })}
              />
            </div>
            <div>
              <Label>Valor total *</Label>
              <Input
                type="number"
                step="0.01"
                value={editing.total_amount ?? ""}
                onChange={(e) => editSet("total_amount", e.target.value)}
              />
            </div>
            <div>
              <Label>Valor pago *</Label>
              <Input
                type="number"
                step="0.01"
                value={editing.paid_amount ?? ""}
                onChange={(e) => editSet("paid_amount", e.target.value)}
              />
            </div>
            <div>
              <Label>Status pagamento *</Label>
              <Select
                value={editing.payment_status}
                onValueChange={(v) => editSet("payment_status", v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pago_total">Pago total</SelectItem>
                  <SelectItem value="pago_parcial">Pago parcial</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Forma de pagamento *</Label>
              <Select
                value={editing.payment_method ?? ""}
                onValueChange={(v) => editSet("payment_method", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pix">Pix</SelectItem>
                  <SelectItem value="cartao">Cartão</SelectItem>
                  <SelectItem value="boleto">Boleto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {editing.payment_method === "cartao" && (
              <div>
                <Label>Parcelas Máx. (Pagar.me)</Label>
                <Select
                  value={String(editing.installments || "12")}
                  onValueChange={(v) => editSet("installments", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => (
                      <SelectItem key={n} value={String(n)}>
                        {n}x
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Vendedor *</Label>
              <Select
                value={editing.seller_id ?? ""}
                onValueChange={(v) => editSet("seller_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(sellers ?? []).map((s) =>
                    optionValue(s.id) ? (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {optionText(s.name)}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Produtor *</Label>
              <Select
                value={editing.producer_id ?? ""}
                onValueChange={(v) => editSet("producer_id", v)}
                disabled={producerLocked}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(producers ?? []).map((p) =>
                    optionValue(p.id) ? (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {optionText(p.name)}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Tipo de serviço *</Label>
              <Select
                value={editing.service_type_id ?? ""}
                onValueChange={(v) => editSet("service_type_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(serviceTypes ?? []).map((s) =>
                    optionValue(s.id) ? (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {optionText(s.name)}
                      </SelectItem>
                    ) : null,
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Pacote (opcional)</Label>
              <Select
                value={editing.package_id ?? ""}
                onValueChange={(v) => {
                  const p = (packages ?? []).find((x) => x.id === v);
                  onFieldChange({
                    package_id: v,
                    package_name: p?.name ?? editing.package_name,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  {(packages ?? []).length === 0 ? (
                    <div className="px-3 py-4 text-xs text-muted-foreground">
                      Nenhum pacote cadastrado.
                    </div>
                  ) : (
                    (packages ?? []).map((p) =>
                      optionValue(p.id) ? (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {optionText(p.name)}
                        </SelectItem>
                      ) : null,
                    )
                  )}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Qtd. serviços *</Label>
              <Input
                type="number"
                min="1"
                value={editing.service_quantity ?? 1}
                onChange={(e) => editSet("service_quantity", e.target.value)}
              />
            </div>
            {isVideoService(
              serviceTypes.find((st) => st.id === editing.service_type_id)?.name ?? undefined,
              !!editing.package_id,
            ) && (
              <div>
                <Label>Minutagem do vídeo *</Label>
                <Select
                  value={String(editing.video_duration_seconds ?? "")}
                  onValueChange={(v) => editSet("video_duration_seconds", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione (mín. 30s)" />
                  </SelectTrigger>
                  <SelectContent>
                    {VIDEO_DURATION_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={String(o.value)}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Data da venda *</Label>
              <Input
                type="date"
                value={editing.sale_date ?? ""}
                onChange={(e) => editSet("sale_date", e.target.value)}
              />
            </div>
            <div>
              <Label>Data de entrega *</Label>
              <Input
                type="date"
                value={editing.expected_delivery_date ?? ""}
                onChange={(e) => editSet("expected_delivery_date", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>Origem da venda *</Label>
              <Select
                value={editing.lead_source ?? ""}
                onValueChange={(v) => editSet("lead_source", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a origem" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cliente_recuperacao">Cliente Recuperação</SelectItem>
                  <SelectItem value="trafego_pago">Tráfego Pago</SelectItem>
                  <SelectItem value="indicacao">Indicação</SelectItem>
                  <SelectItem value="organico">Orgânico / Redes Sociais</SelectItem>
                  <SelectItem value="cliente_antigo">Cliente Antigo</SelectItem>
                  <SelectItem value="prospeccao">Prospecção Ativa</SelectItem>
                  <SelectItem value="outros">Outros</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Prazo de entrega *</Label>
              <Input
                placeholder="Ex: 7 dias úteis"
                value={editing.delivery_deadline ?? ""}
                onChange={(e) => editSet("delivery_deadline", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>Observações (opcional)</Label>
              <Textarea
                value={editing.notes ?? ""}
                onChange={(e) => editSet("notes", e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>Link do Google Drive (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="https://drive.google.com/..."
                  value={editing.google_drive_link ?? ""}
                  onChange={(e) => editSet("google_drive_link", e.target.value)}
                />
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
            <div className="col-span-2">
              <Label>Link da Plataforma (pasta interna) (opcional)</Label>
              <div className="flex gap-2">
                <Input
                  placeholder="Cole aqui o link gerado no Chat Organizador"
                  value={editing.platform_link ?? ""}
                  onChange={(e) => editSet("platform_link", e.target.value)}
                />
                <Button type="button" variant="outline" asChild>
                  <a href="/chat-organizador" target="_blank" rel="noreferrer">
                    Abrir Chat
                  </a>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                Opcional. Se quiser, informe um dos dois links (Drive ou Plataforma). Não precisa
                preencher os dois.
              </p>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button onClick={onSubmit} disabled={editSaving}>
            {editSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {editing?.payment_method === "pix" || editing?.payment_method === "cartao"
              ? "Confirmar e Salvar"
              : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
