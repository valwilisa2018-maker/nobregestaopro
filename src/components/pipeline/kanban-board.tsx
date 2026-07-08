import {
  DndContext, DragEndEvent, DragOverlay, DragStartEvent,
  PointerSensor, useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable } from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useMemo, useState } from "react";
import { Deal, Stage, formatBRL } from "./types";
import { DealCard } from "./deal-card";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

interface Props {
  stages: Stage[];
  deals: Deal[];
  onOpenDeal: (deal: Deal) => void;
  onCreateInStage: (stageId: string) => void;
  onMove: (dealId: string, toStageId: string) => Promise<void>;
}

export function KanbanBoard({ stages, deals, onOpenDeal, onCreateInStage, onMove }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const dealsByStage = useMemo(() => {
    const m = new Map<string, Deal[]>();
    stages.forEach((s) => m.set(s.id, []));
    deals.forEach((d) => {
      const arr = m.get(d.stage_id);
      if (arr) arr.push(d);
    });
    return m;
  }, [stages, deals]);

  const activeDeal = activeId ? deals.find((d) => d.id === activeId) : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));

  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const dealId = String(active.id);
    const overId = String(over.id);
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    // over can be a stage id or a card id
    let toStageId = overId;
    if (!stages.find((s) => s.id === overId)) {
      const overDeal = deals.find((d) => d.id === overId);
      if (overDeal) toStageId = overDeal.stage_id;
    }
    if (toStageId === deal.stage_id) return;
    await onMove(dealId, toStageId);
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
      <div className="flex gap-3 overflow-x-auto pb-4 -mx-3 sm:-mx-6 px-3 sm:px-6">
        {stages.map((stage) => {
          const stageDeals = dealsByStage.get(stage.id) ?? [];
          const total = stageDeals.reduce((s, d) => s + (d.value_cents || 0), 0);
          return (
            <StageColumn
              key={stage.id}
              stage={stage}
              deals={stageDeals}
              total={total}
              onOpenDeal={onOpenDeal}
              onCreate={() => onCreateInStage(stage.id)}
            />
          );
        })}
      </div>
      <DragOverlay>
        {activeDeal && <DealCard deal={activeDeal} onClick={() => {}} />}
      </DragOverlay>
    </DndContext>
  );
}

function StageColumn({
  stage, deals, total, onOpenDeal, onCreate,
}: { stage: Stage; deals: Deal[]; total: number; onOpenDeal: (d: Deal) => void; onCreate: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });

  return (
    <div
      ref={setNodeRef}
      className={`w-72 shrink-0 rounded-2xl border border-border/60 bg-muted/30 backdrop-blur flex flex-col max-h-[calc(100vh-280px)] transition ${
        isOver ? "ring-2 ring-primary/60 bg-primary/5" : ""
      }`}
    >
      <div className="p-3 border-b border-border/60" style={{ borderTopLeftRadius: 16, borderTopRightRadius: 16, background: `linear-gradient(180deg, ${stage.color}22, transparent)` }}>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: stage.color }} />
            <h3 className="font-semibold text-sm truncate">{stage.name}</h3>
            <span className="text-xs text-muted-foreground shrink-0">({deals.length})</span>
          </div>
          <Button size="icon" variant="ghost" className="h-6 w-6" onClick={onCreate} aria-label="Adicionar cartão">
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="text-xs font-semibold text-muted-foreground mt-1">{formatBRL(total)}</div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2">
        <SortableContext items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} onClick={() => onOpenDeal(d)} />
          ))}
        </SortableContext>
        {deals.length === 0 && (
          <div className="text-xs text-center text-muted-foreground/60 py-6 border border-dashed border-border/40 rounded-lg">
            Solte cartões aqui
          </div>
        )}
      </div>
    </div>
  );
}