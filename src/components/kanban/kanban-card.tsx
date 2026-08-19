import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertCircle, Calendar, CheckCircle2, Clock, UserPlus } from "lucide-react";
import { fmtDate, fmtDateTime, formatCurrency, formatVideoDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardLinkButtons } from "./card-link-buttons";
import { KanbanPersonAvatar } from "./person-avatar";
import { CardWhatsAppButtons } from "./whatsapp-buttons";
import {
  isCardOverdue,
  parseLabel,
  paymentStyle,
  type KanbanCardData,
  type ProducerOption,
} from "./types";

export interface KanbanCardProps {
  card: KanbanCardData;
  colColor: string;
  colIsDefault?: boolean | null;
  colIsDone?: boolean | null;
  producers: ProducerOption[];
  showCompany?: boolean;
  className?: string;
  onTransfer: (producerId: string) => void;
  onClick: () => void;
  onDragStart: () => void;
  onDrag: () => void;
  onDragEnd: () => void;
}

export function KanbanCard({
  card: c,
  colColor,
  colIsDefault,
  colIsDone,
  producers,
  showCompany = true,
  className,
  onTransfer,
  onClick,
  onDragStart,
  onDrag,
  onDragEnd,
}: KanbanCardProps) {
  const phone = c.sales?.customers?.phone;
  const seller = c.sales?.sellers;
  const producer = c.producer ?? c.sales?.producers;

  return (
    <div data-kanban-card-id={c.id} className={cn("relative", className)}>
      <CardWhatsAppButtons phone={phone} customerName={c.sales?.customers?.name} />
      <Card
        draggable
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClick={onClick}
        className="cursor-pointer overflow-hidden border-2 border-foreground/15 bg-background shadow-md transition-all hover:border-primary/70"
        style={{
          boxShadow: "var(--shadow-card)",
          borderLeft: `4px solid ${colColor || "var(--primary)"}`,
        }}
      >
        <CardContent className="space-y-2 p-3">
          {(c.labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.labels!.map((raw, i) => {
                const { name, color } = parseLabel(raw);
                return (
                  <span
                    key={i}
                    className="rounded px-1.5 py-0.5 text-[10px] font-medium"
                    style={{
                      background:
                        color ||
                        "color-mix(in oklab, var(--primary) calc(0.15 * 100%), transparent)",
                      color: color ? "#fff" : "var(--primary)",
                    }}
                  >
                    {name}
                  </span>
                );
              })}
            </div>
          )}

          <div className="text-sm font-medium leading-tight">
            {c.title}
            {isCardOverdue(c) && colIsDefault && (
              <div className="flex items-center gap-1 text-[11px] font-bold uppercase text-destructive animate-pulse">
                <AlertCircle className="h-3 w-3" />
                Atrasado
              </div>
            )}
          </div>

          {colIsDone && c.delivered_at && (
            <div className="flex items-center gap-1.5 rounded-md border border-success/40 bg-success/15 px-2 py-1 text-[11px] font-bold uppercase tracking-wide text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finalizado {fmtDateTime(c.delivered_at)}
            </div>
          )}

          {showCompany && c.sales?.customers?.company && (
            <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
          )}

          {(c.due_date ||
            c.due_time ||
            c.expected_delivery_date ||
            c.sales?.expected_delivery_date) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {c.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Prazo: {fmtDate(c.due_date)}
                </span>
              )}
              {(c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                <span className="flex items-center gap-1 font-medium text-primary">
                  <Calendar className="h-3 w-3" />
                  Entrega: {fmtDate(c.expected_delivery_date || c.sales?.expected_delivery_date)}
                </span>
              )}
              {c.due_time && (
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {c.due_time.slice(0, 5)}
                </span>
              )}
            </div>
          )}

          <div className="flex items-start justify-between gap-3 text-xs">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-muted-foreground">
              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
                <KanbanPersonAvatar
                  bucket="seller-avatars"
                  name={seller?.name}
                  value={seller?.avatar_url}
                />
                <span className="truncate">
                  Vendedor:{" "}
                  <span className="font-semibold text-success">{seller?.name ?? "-"}</span>
                </span>
              </div>

              <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
                <KanbanPersonAvatar
                  bucket="producer-avatars"
                  name={producer?.name}
                  value={producer?.avatar_url}
                />
                <span className="truncate">
                  Produtor:{" "}
                  <span className="font-semibold text-success">{producer?.name ?? "-"}</span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="ml-1 shrink-0 text-primary hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <UserPlus className="h-3 w-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuLabel>Transferir Servico</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {producers.map((p) => (
                      <DropdownMenuItem
                        key={p.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onTransfer(p.id);
                        }}
                      >
                        {p.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {c.sales?.payment_status && (
              <div className="shrink-0">
                <span
                  className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{
                    background: paymentStyle(c.sales.payment_status).bg,
                    color: paymentStyle(c.sales.payment_status).fg,
                  }}
                >
                  {paymentStyle(c.sales.payment_status).label}
                </span>
              </div>
            )}
          </div>

          <CardLinkButtons
            driveLink={c.google_drive_link ?? c.sales?.google_drive_link ?? null}
            platformLink={c.platform_link ?? c.sales?.platform_link ?? null}
          />
        </CardContent>
      </Card>
    </div>
  );
}

export interface KanbanCardBadgesRowProps {
  card: KanbanCardData;
}

export function KanbanCardBadgesRow({ card: c }: KanbanCardBadgesRowProps) {
  const duration = c.video_duration_seconds;
  if (!(c.sales?.payment_status === "pago_parcial" || duration)) return null;

  return (
    <div className="flex flex-wrap justify-end gap-1">
      {duration ? (
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm"
          style={{ background: "#3b82f6", color: "#fff" }}
        >
          Video {formatVideoDuration(duration)}
        </span>
      ) : null}
      {c.sales?.payment_status === "pago_parcial" && (
        <span
          className="rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm"
          style={{ background: "#f59e0b", color: "#1a1a1a" }}
        >
          A receber:{" "}
          {formatCurrency(Number(c.sales.total_amount ?? 0) - Number(c.sales.paid_amount ?? 0))}
        </span>
      )}
    </div>
  );
}
