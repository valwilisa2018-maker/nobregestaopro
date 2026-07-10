import type { CSSProperties } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Deal, PRIORITY_COLOR, PRIORITY_LABEL, formatBRL } from "./types";
import { Building2, Phone, Calendar, GripVertical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function DealCard({ deal, onClick, stageColor }: { deal: Deal; onClick: () => void; stageColor?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id });
  const color = stageColor || "#6366f1";
  const dark = isDarkColor(color);
  const fg = dark ? "#ffffff" : "#0b0b0b";
  const subtle = dark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.7)";
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    background: color,
    borderColor: color,
    color: fg,
  } satisfies CSSProperties;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group rounded-xl border border-border/60 backdrop-blur p-3 shadow-sm hover:shadow-md transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start gap-2">
        <button
          {...attributes}
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="mt-0.5 text-muted-foreground/50 hover:text-muted-foreground cursor-grab active:cursor-grabbing"
          aria-label="Arrastar"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1 space-y-1.5" style={{ color: fg }}>
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm truncate">{deal.title}</p>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${PRIORITY_COLOR[deal.priority]}`}>
              {PRIORITY_LABEL[deal.priority]}
            </Badge>
          </div>
          {deal.company && (
            <div className="flex items-center gap-1 text-xs truncate" style={{ color: subtle }}>
              <Building2 className="h-3 w-3 shrink-0" /> <span className="truncate">{deal.company}</span>
            </div>
          )}
          {(deal.phone || deal.whatsapp) && (
            <div className="flex items-center gap-1 text-xs truncate" style={{ color: subtle }}>
              <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{deal.whatsapp || deal.phone}</span>
            </div>
          )}
          {deal.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {deal.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[10px] rounded-full px-2 py-0.5" style={{ background: dark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.12)", color: fg }}>{t}</span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-bold" style={{ color: fg }}>{formatBRL(deal.value_cents)}</span>
            {deal.next_contact_at && (
              <span className="flex items-center gap-1 text-[10px]" style={{ color: subtle }}>
                <Calendar className="h-3 w-3" />
                {format(new Date(deal.next_contact_at), "dd/MM", { locale: ptBR })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function isDarkColor(c: string): boolean {
  const hex = c.trim().replace("#", "");
  if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return true;
  const full = hex.length === 3 ? hex.split("").map((x) => x + x).join("") : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  // perceived luminance
  return (0.299 * r + 0.587 * g + 0.114 * b) < 160;
}