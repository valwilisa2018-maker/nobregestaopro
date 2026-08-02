import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ExternalLink, Loader2, MessageCircle, Trash2, X } from "lucide-react";
import { waHref, formatPhoneBR } from "@/lib/phone";
import { CardHistory } from "./card-history";
import { CARD_COLORS, LABEL_COLORS, parseLabel, type CardForm, type KanbanColumnData, type ProducerOption } from "./types";

export interface CardEditDialogProps {
  editing: CardForm | null;
  onOpenChange: (open: boolean) => void;
  onChange: (form: CardForm) => void;
  columns: KanbanColumnData[];
  producers: ProducerOption[];
  canTransferProducer: boolean;
  newLabel: string;
  onNewLabelChange: (v: string) => void;
  newLabelColor: string;
  onNewLabelColorChange: (v: string) => void;
  onAddLabel: () => void;
  onRemoveLabel: (i: number) => void;
  saving: boolean;
  onSave: () => void;
  onDelete: () => void;
}

export function CardEditDialog({
  editing,
  onOpenChange,
  onChange,
  columns,
  producers,
  canTransferProducer,
  newLabel,
  onNewLabelChange,
  newLabelColor,
  onNewLabelColorChange,
  onAddLabel,
  onRemoveLabel,
  saving,
  onSave,
  onDelete,
}: CardEditDialogProps) {
  return (
    <Dialog open={!!editing} onOpenChange={(o) => !o && onOpenChange(false)}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing?.id ? "Editar card" : "Novo card"}</DialogTitle>
        </DialogHeader>
        {editing && (
          <div className="space-y-3">
            <div>
              <Label>Título *</Label>
              <Input
                value={editing.title}
                onChange={(e) => onChange({ ...editing, title: e.target.value })}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={editing.description}
                onChange={(e) => onChange({ ...editing, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Coluna</Label>
                <Select
                  value={editing.column_id}
                  onValueChange={(v) => onChange({ ...editing, column_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(columns ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Cor do card</Label>
                <Select
                  value={editing.color || "_none"}
                  onValueChange={(v) => onChange({ ...editing, color: v === "_none" ? "" : v })}
                >
                  <SelectTrigger>
                    <div className="flex items-center gap-2">
                      {editing.color && (
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ background: editing.color }}
                        />
                      )}
                      <SelectValue />
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {CARD_COLORS.map((c) => (
                      <SelectItem key={c.value || "_none"} value={c.value || "_none"}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full border"
                            style={{ background: c.value || "transparent" }}
                          />
                          {c.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Prazo Interno</Label>
                <Input
                  type="date"
                  value={editing.due_date}
                  onChange={(e) => onChange({ ...editing, due_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Horário</Label>
                <Input
                  type="time"
                  value={editing.due_time}
                  onChange={(e) => onChange({ ...editing, due_time: e.target.value })}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-primary">Data de Entrega (Sincronizada da Venda)</Label>
                <Input
                  type="date"
                  value={editing.expected_delivery_date || ""}
                  onChange={(e) =>
                    onChange({ ...editing, expected_delivery_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>
                Produtor
                {!canTransferProducer && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    (somente admin pode alterar)
                  </span>
                )}
              </Label>
              <Select
                value={editing.producer_id || "_none"}
                onValueChange={(v) =>
                  onChange({ ...editing, producer_id: v === "_none" ? null : v })
                }
                disabled={!canTransferProducer}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecionar produtor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {(producers ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Link do projeto</Label>
              <Input
                type="url"
                placeholder="https://drive.google.com/..."
                value={editing.google_drive_link ?? ""}
                onChange={(e) => onChange({ ...editing, google_drive_link: e.target.value })}
              />
              {editing.google_drive_link && (
                <a
                  href={editing.google_drive_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-blue-500 hover:underline break-all mt-1"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  Abrir Google Drive
                </a>
              )}
            </div>
            <div>
              <Label>Minutagem do vídeo (deste card)</Label>
              <Input
                type="text"
                placeholder="Ex: 2:30, 1:02:30, 2min30s ou 150s"
                value={editing.video_duration_input ?? ""}
                onChange={(e) => onChange({ ...editing, video_duration_input: e.target.value })}
              />
              <p className="text-xs text-muted-foreground mt-1 opacity-70">
                Cada vídeo do pacote pode ter sua própria minutagem. Deixe em branco para herdar
                da venda.
              </p>
            </div>
            <div>
              <Label>Link da pasta da plataforma</Label>
              <Input
                type="url"
                placeholder="https://.../pastas-arquivos/..."
                value={editing.platform_link ?? ""}
                onChange={(e) => onChange({ ...editing, platform_link: e.target.value })}
              />
              {editing.platform_link ? (
                <a
                  href={editing.platform_link}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-2 text-sm text-red-500 hover:underline break-all mt-1"
                >
                  <ExternalLink className="w-4 h-4 shrink-0" />
                  Abrir na Plataforma
                </a>
              ) : (
                <p className="text-xs text-muted-foreground mt-1 opacity-60">
                  Cole o link da pasta da plataforma para ativar o botão
                </p>
              )}
            </div>
            {editing.customer_phone && waHref(editing.customer_phone) && (
              <div>
                <Label>Cliente</Label>
                <a
                  href={
                    waHref(editing.customer_phone, `Olá ${editing.customer_name ?? ""}!`.trim())!
                  }
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-2 px-3 py-2 rounded-md bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp {formatPhoneBR(editing.customer_phone)}
                </a>
              </div>
            )}
            <div>
              <Label>Etiquetas</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  value={newLabel}
                  onChange={(e) => onNewLabelChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      onAddLabel();
                    }
                  }}
                  placeholder="Nova etiqueta…"
                />
                <Button type="button" variant="outline" onClick={onAddLabel}>
                  Adicionar
                </Button>
              </div>
              <div className="flex items-center gap-1 mt-2">
                <span className="text-[11px] text-muted-foreground mr-1">Cor:</span>
                {LABEL_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onNewLabelColorChange(c)}
                    className={`w-5 h-5 rounded-full border-2 transition-all ${newLabelColor === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ background: c }}
                    aria-label={c}
                  />
                ))}
              </div>
              {editing.labels.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {editing.labels.map((raw, i) => {
                    const { name, color } = parseLabel(raw);
                    return (
                      <span
                        key={i}
                        className="flex items-center gap-1 text-xs px-2 py-1 rounded font-medium"
                        style={{
                          background: color || "var(--muted)",
                          color: color ? "#fff" : "var(--foreground)",
                        }}
                      >
                        {name}
                        <button
                          type="button"
                          onClick={() => onRemoveLabel(i)}
                          className="hover:opacity-70"
                          style={{ color: color ? "#fff" : undefined }}
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {editing?.id && <CardHistory cardId={editing.id} />}
        <DialogFooter className="gap-2">
          {editing?.id && (
            <Button variant="destructive" onClick={onDelete} className="mr-auto">
              <Trash2 className="w-4 h-4 mr-2" />
              Excluir
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
