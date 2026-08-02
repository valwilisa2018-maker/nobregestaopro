import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Calendar, Clock, AlertCircle, CheckCircle2, UserPlus } from "lucide-react";
import { fmtDate, fmtDateTime, formatCurrency, formatVideoDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CardLinkButtons } from "./card-link-buttons";
import { CardWhatsAppButtons } from "./whatsapp-buttons";
import {
  parseLabel,
  paymentStyle,
  isCardOverdue,
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

// Card individual de serviço no Kanban (usado tanto solo quanto dentro de um grupo expandido).
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
  return (
    <div className={cn("relative", className)}>
      <CardWhatsAppButtons phone={phone} customerName={c.sales?.customers?.name} />
      <Card
        draggable
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClick={onClick}
        className="cursor-pointer bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
        style={{
          boxShadow: "var(--shadow-card)",
          borderLeft: `4px solid ${colColor || "var(--primary)"}`,
        }}
      >
        <CardContent className="p-3 space-y-2">
          {(c.labels?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1">
              {c.labels!.map((raw: string, i: number) => {
                const { name, color } = parseLabel(raw);
                return (
                  <span
                    key={i}
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
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
              <div className="flex items-center gap-1 text-[11px] font-bold text-destructive uppercase animate-pulse">
                <AlertCircle className="w-3 h-3" /> Atrasado
              </div>
            )}
          </div>
          {colIsDone && c.delivered_at && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-success/15 border border-success/40 text-success text-[11px] font-bold uppercase tracking-wide">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Finalizado {fmtDateTime(c.delivered_at)}
            </div>
          )}
          {showCompany && c.sales?.customers?.company && (
            <div className="text-xs text-muted-foreground">{c.sales.customers.company}</div>
          )}
          {(c.due_date || c.due_time || c.expected_delivery_date || c.sales?.expected_delivery_date) && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
              {c.due_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  Prazo: {fmtDate(c.due_date)}
                </span>
              )}
              {(c.expected_delivery_date || c.sales?.expected_delivery_date) && (
                <span className="flex items-center gap-1 text-primary font-medium">
                  <Calendar className="w-3 h-3" /> Entrega:{" "}
                  {fmtDate(c.expected_delivery_date || c.sales?.expected_delivery_date)}
                </span>
              )}
              {c.due_time && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {c.due_time.slice(0, 5)}
                </span>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-xs">
            <div className="flex flex-col gap-0.5 text-muted-foreground">
              <span>
                Vendedor:{" "}
                <span className="font-semibold text-success" style={{}}>
                  {c.sales?.sellers?.name ?? "—"}
                </span>
              </span>
              <div className="flex items-center gap-1">
                <span>
                  Produtor:{" "}
                  <span className="font-semibold text-success" style={{}}>
                    {c.producer?.name ?? c.sales?.producers?.name ?? "—"}
                  </span>
                </span>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="text-primary hover:underline ml-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <UserPlus className="w-3 h-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-48">
                    <DropdownMenuLabel>Transferir Serviço</DropdownMenuLabel>
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
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: paymentStyle(c.sales.payment_status).bg,
                  color: paymentStyle(c.sales.payment_status).fg,
                }}
              >
                {paymentStyle(c.sales.payment_status).label}
              </span>
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

// Faixa de badges (minutagem / a receber) exibida acima do card solo.
export function KanbanCardBadgesRow({ card: c }: KanbanCardBadgesRowProps) {
  const duration = c.video_duration_seconds ?? c.sales?.video_duration_seconds;
  if (!(c.sales?.payment_status === "pago_parcial" || duration)) return null;
  return (
    <div className="flex justify-end gap-1 flex-wrap">
      {duration ? (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm"
          style={{ background: "#3b82f6", color: "#fff" }}
        >
          🎬 {formatVideoDuration(duration)}
        </span>
      ) : null}
      {c.sales?.payment_status === "pago_parcial" && (
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm"
          style={{ background: "#f59e0b", color: "#1a1a1a" }}
        >
          A receber:{" "}
          {formatCurrency(Number(c.sales.total_amount ?? 0) - Number(c.sales.paid_amount ?? 0))}
        </span>
      )}
    </div>
  );
}
