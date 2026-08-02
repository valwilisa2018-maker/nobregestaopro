import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, ChevronRight, Layers, UserPlus } from "lucide-react";
import { formatCurrency, formatVideoDuration } from "@/lib/format";
import { CardLinkButtons } from "./card-link-buttons";
import { paymentStyle, type KanbanCardData, type ProducerOption } from "./types";

export interface KanbanGroupCardProps {
  cards: KanbanCardData[];
  colColor: string;
  isOpen: boolean;
  producers: ProducerOption[];
  onTransferGroup: (producerId: string) => void;
  onClick: () => void;
  onDragStart: () => void;
  onDrag: () => void;
  onDragEnd: () => void;
}

// Card resumo de um pacote (várias ordens de serviço da mesma venda) no Kanban.
export function KanbanGroupCard({
  cards,
  colColor,
  isOpen,
  producers,
  onTransferGroup,
  onClick,
  onDragStart,
  onDrag,
  onDragEnd,
}: KanbanGroupCardProps) {
  const first = cards[0];
  const customerName = first.sales?.customers?.name ?? "Cliente";
  const company = first.sales?.customers?.company;
  const duration = (first as any).video_duration_seconds ?? first.sales?.video_duration_seconds;
  return (
    <>
      {(first.sales?.payment_status === "pago_parcial" || duration) && (
        <div className="flex justify-end gap-1 flex-wrap">
          {duration ? (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm"
              style={{ background: "#3b82f6", color: "#fff" }}
            >
              🎬 {formatVideoDuration(duration)}
            </span>
          ) : null}
          {first.sales?.payment_status === "pago_parcial" && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-md shadow-sm"
              style={{ background: "#f59e0b", color: "#1a1a1a" }}
            >
              A receber:{" "}
              {formatCurrency(
                Number(first.sales.total_amount ?? 0) - Number(first.sales.paid_amount ?? 0),
              )}
            </span>
          )}
        </div>
      )}
      <Card
        draggable
        onDragStart={onDragStart}
        onDrag={onDrag}
        onDragEnd={onDragEnd}
        onClick={onClick}
        className="cursor-grab active:cursor-grabbing bg-background hover:border-primary/70 transition-all overflow-hidden border-2 border-foreground/15 shadow-md"
        style={{
          boxShadow: "var(--shadow-card)",
          borderLeft: `4px solid ${colColor || "var(--primary)"}`,
        }}
      >
        <CardContent className="p-3 space-y-1">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              <Layers className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium">{customerName}</span>
            </div>
            <div className="flex items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label="Transferir pacote"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <UserPlus className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuLabel>Transferir Pacote</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {producers.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTransferGroup(p.id);
                      }}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <Badge variant="secondary" className="text-[10px]">
                {cards.length} serviços
              </Badge>
            </div>
          </div>
          {company && <div className="text-xs text-muted-foreground pl-6">{company}</div>}
          <div className="flex flex-col gap-0.5 text-[11px] text-muted-foreground pl-6">
            <span>
              Vendedor:{" "}
              <span className="font-semibold text-success" style={{}}>
                {first.sales?.sellers?.name ?? "—"}
              </span>
            </span>
            <div className="flex items-center gap-1">
              <span>
                Produtor:{" "}
                <span className="font-semibold text-success" style={{}}>
                  {first.producer?.name ?? first.sales?.producers?.name ?? "—"}
                </span>
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="text-primary hover:underline ml-1" onClick={(e) => e.stopPropagation()}>
                    <UserPlus className="w-3 h-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-48">
                  <DropdownMenuLabel>Transferir Pacote</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {producers.map((p) => (
                    <DropdownMenuItem
                      key={p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onTransferGroup(p.id);
                      }}
                    >
                      {p.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          {first.sales?.payment_status && (
            <div className="pl-6 pt-1">
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                style={{
                  background: paymentStyle(first.sales.payment_status).bg,
                  color: paymentStyle(first.sales.payment_status).fg,
                }}
              >
                {paymentStyle(first.sales.payment_status).label}
              </span>
            </div>
          )}
          <CardLinkButtons
            driveLink={first.google_drive_link ?? first.sales?.google_drive_link ?? null}
            platformLink={first.platform_link ?? first.sales?.platform_link ?? null}
          />
        </CardContent>
      </Card>
    </>
  );
}
