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
  const color = stageColor || "var(--primary)";
  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    borderLeft: `3px solid ${color}`,
    background: `linear-gradient(180deg, color-mix(in oklch, ${color} 8%, transparent), color-mix(in oklch, var(--card) 80%, transparent))`,
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
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex items-start justify-between gap-2">
            <p className="font-semibold text-sm truncate">{deal.title}</p>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 shrink-0 ${PRIORITY_COLOR[deal.priority]}`}>
              {PRIORITY_LABEL[deal.priority]}
            </Badge>
          </div>
          {deal.company && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Building2 className="h-3 w-3 shrink-0" /> <span className="truncate">{deal.company}</span>
            </div>
          )}
          {(deal.phone || deal.whatsapp) && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground truncate">
              <Phone className="h-3 w-3 shrink-0" /> <span className="truncate">{deal.whatsapp || deal.phone}</span>
            </div>
          )}
          {deal.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {deal.tags.slice(0, 3).map((t) => (
                <span key={t} className="text-[10px] rounded-full bg-primary/10 text-primary px-2 py-0.5">{t}</span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between pt-1">
            <span className="text-sm font-bold text-primary">{formatBRL(deal.value_cents)}</span>
            {deal.next_contact_at && (
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
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