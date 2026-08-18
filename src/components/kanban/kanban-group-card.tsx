import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
import { resolveOrderVideoDurationSeconds, sumVideoDurations } from "@/lib/video-production";
import { CardLinkButtons } from "./card-link-buttons";
import { KanbanPersonAvatar } from "./person-avatar";
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
  const duration = sumVideoDurations(cards.map((card) => resolveOrderVideoDurationSeconds(card)));
  const seller = first.sales?.sellers;
  const producer = first.producer ?? first.sales?.producers;

  return (
    <>
      {(first.sales?.payment_status === "pago_parcial" || duration) && (
        <div className="flex flex-wrap justify-end gap-1">
          {duration ? (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm"
              style={{ background: "#3b82f6", color: "#fff" }}
            >
              Video {formatVideoDuration(duration)}
            </span>
          ) : null}
          {first.sales?.payment_status === "pago_parcial" && (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold shadow-sm"
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
        className="cursor-grab overflow-hidden border-2 border-foreground/15 bg-background shadow-md transition-all hover:border-primary/70 active:cursor-grabbing"
        style={{
          boxShadow: "var(--shadow-card)",
          borderLeft: `4px solid ${colColor || "var(--primary)"}`,
        }}
      >
        <CardContent className="space-y-2 p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <Layers className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate text-sm font-medium">{customerName}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-muted-foreground hover:text-foreground"
                    aria-label="Transferir pacote"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <UserPlus className="h-4 w-4" />
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
                {cards.length} servicos
              </Badge>
            </div>
          </div>

          {company && <div className="pl-6 text-xs text-muted-foreground">{company}</div>}

          <div className="flex flex-col gap-1.5 pl-6 text-[11px] text-muted-foreground">
            <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1">
              <KanbanPersonAvatar
                bucket="seller-avatars"
                name={seller?.name}
                value={seller?.avatar_url}
              />
              <span className="truncate">
                Vendedor: <span className="font-semibold text-success">{seller?.name ?? "-"}</span>
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
                className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
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
