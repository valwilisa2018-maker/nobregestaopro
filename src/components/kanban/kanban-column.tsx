import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Edit2, Plus } from "lucide-react";
import { KanbanCard, KanbanCardBadgesRow } from "./kanban-card";
import { KanbanGroupCard } from "./kanban-group-card";
import { VirtualList } from "@/components/virtual-list";
import { KanbanCardsSkeleton, EmptyState } from "@/components/list-states";
import { Inbox } from "lucide-react";
import type { KanbanCardData, KanbanColumnData, ProducerOption } from "./types";

export interface KanbanColumnProps {
  col: KanbanColumnData;
  cards: KanbanCardData[];
  loading?: boolean;
  producers: ProducerOption[];
  search: string;
  producerFilter: string;
  expandedGroups: Record<string, boolean>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  dragging: string | null;
  draggingGroup: string[] | null;
  draggingFromCol: string | null;
  dragMoved: boolean;
  setDragging: (id: string | null) => void;
  setDraggingGroup: (ids: string[] | null) => void;
  setDraggingFromCol: (id: string | null) => void;
  setDragMoved: (v: boolean) => void;
  resetDragState: () => void;
  safeMutate: (fn: () => Promise<void>) => Promise<void>;
  move: (cardId: string, columnId: string) => Promise<void>;
  moveMany: (cardIds: string[], columnId: string) => Promise<void>;
  reorderInColumn: (colId: string, movingIds: string[], beforeCardId: string | null) => Promise<void>;
  transferCard: (cardId: string, producerId: string) => Promise<void>;
  transferMany: (cardIds: string[], producerId: string) => Promise<void>;
  openNew: (columnId: string) => void;
  openEdit: (c: KanbanCardData) => void;
  onEditColumn: (col: KanbanColumnData) => void;
}

type Item = { kind: "solo"; card: KanbanCardData } | { kind: "group"; saleId: string; cards: KanbanCardData[] };

export function KanbanColumn({
  col,
  cards,
  loading = false,
  producers,
  search,
  producerFilter,
  expandedGroups,
  setExpandedGroups,
  dragging,
  draggingGroup,
  draggingFromCol,
  dragMoved,
  setDragging,
  setDraggingGroup,
  setDraggingFromCol,
  setDragMoved,
  resetDragState,
  safeMutate,
  move,
  moveMany,
  reorderInColumn,
  transferCard,
  transferMany,
  openNew,
  openEdit,
  onEditColumn,
}: KanbanColumnProps) {
  const q = search.trim().toLowerCase();
  const { colCards, items } = useMemo(() => {
  const colCards = cards.filter((c: any) => {
    if (c.column_id !== col.id) return false;
    if (producerFilter !== "all" && !q) {
      const cardProducerId = c.producer_id;
      const saleProducerId = c.sales?.producer_id;
      if (cardProducerId) {
        if (cardProducerId !== producerFilter) return false;
      } else if (saleProducerId) {
        if (saleProducerId !== producerFilter) return false;
      } else {
        return false;
      }
    }
    if (q) {
      const hay = [
        c.title,
        c.description,
        c.sales?.customers?.name,
        c.sales?.customers?.company,
        c.sales?.sellers?.name,
        c.producer?.name,
        c.sales?.producers?.name,
        ...(c.labels ?? []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (col.is_default) {
    colCards.sort((a: any, b: any) => {
      const da = new Date(
        a.expected_delivery_date ?? a.sales?.expected_delivery_date ?? a.created_at,
      ).getTime();
      const db = new Date(
        b.expected_delivery_date ?? b.sales?.expected_delivery_date ?? b.created_at,
      ).getTime();
      return da - db || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });
  } else {
    colCards.sort(
      (a: any, b: any) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }

  const groupsMap = new Map<string, KanbanCardData[]>();
  const soloCards: KanbanCardData[] = [];
  for (const c of colCards as KanbanCardData[]) {
    if (c.sale_id) {
      const arr = groupsMap.get(c.sale_id) ?? [];
      arr.push(c);
      groupsMap.set(c.sale_id, arr);
    } else {
      soloCards.push(c);
    }
  }
  const items: Item[] = [];
  for (const [saleId, arr] of groupsMap) {
    if (arr.length > 1) items.push({ kind: "group", saleId, cards: arr });
    else items.push({ kind: "solo", card: arr[0] });
  }
  for (const c of soloCards) items.push({ kind: "solo", card: c });
  return { colCards, items };
  }, [cards, col.id, col.is_default, producerFilter, q]);

  const movingIds = () => (draggingGroup && draggingGroup.length ? draggingGroup : dragging ? [dragging] : []);

  return (
    <div
      className="min-w-[280px] w-[280px] flex-shrink-0 rounded-lg border-2 border-foreground bg-muted p-3 shadow-md overflow-hidden"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const ids = movingIds();
        if (!ids.length) {
          resetDragState();
          return;
        }
        if (draggingFromCol === col.id) {
          safeMutate(() => reorderInColumn(col.id, ids, null));
        } else if (draggingGroup && draggingGroup.length) {
          safeMutate(() => moveMany(draggingGroup, col.id));
        } else if (dragging) {
          safeMutate(() => move(dragging, col.id));
        } else {
          resetDragState();
        }
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 rounded-t-md bg-foreground text-background -m-3 mb-3">
        <div className="flex items-center gap-2 overflow-hidden mr-1">
          <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: col.color }} />
          <span className="font-semibold text-sm truncate">{col.name}</span>
          <Button
            size="icon"
            variant="ghost"
            className="h-5 w-5 text-background/50 hover:text-background hover:bg-background/10"
            aria-label="Editar coluna"
            onClick={() => onEditColumn(col)}
          >
            <Edit2 className="w-3 h-3" />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Badge variant="outline" className="border-background/40 text-background">
            {colCards.length}
          </Badge>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6 text-background hover:bg-background/10 hover:text-background"
            aria-label="Novo card nesta coluna"
            onClick={() => openNew(col.id)}
          >
            <Plus className="w-4 h-4" />
          </Button>
        </div>
      </div>
      <VirtualList
        items={items}
        estimateSize={132}
        gap={8}
        threshold={20}
        className="min-h-[100px] max-h-[calc(100vh-260px)]"
        keyFor={(it) => (it.kind === "group" ? `${col.id}:${it.saleId}` : it.card.id)}
        renderItem={(it) => {
          if (it.kind === "group") {
            const groupKey = `${col.id}:${it.saleId}`;
            const isOpen = !!expandedGroups[groupKey];
            const first = it.cards[0];
            return (
              <div
                className="space-y-2"
                onDragOver={(e) => {
                  if (draggingFromCol === col.id) {
                    e.preventDefault();
                    e.stopPropagation();
                  }
                }}
                onDrop={(e) => {
                  if (draggingFromCol !== col.id) {
                    resetDragState();
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  const ids = movingIds();
                  if (ids.length && !ids.includes(first.id)) {
                    safeMutate(() => reorderInColumn(col.id, ids, first.id));
                  } else {
                    resetDragState();
                  }
                }}
              >
                <KanbanGroupCard
                  cards={it.cards}
                  colColor={col.color}
                  isOpen={isOpen}
                  producers={producers}
                  onTransferGroup={(producerId) =>
                    transferMany(
                      it.cards.map((x) => x.id),
                      producerId,
                    )
                  }
                  onClick={() => {
                    if (!dragMoved) setExpandedGroups((s) => ({ ...s, [groupKey]: !s[groupKey] }));
                  }}
                  onDragStart={() => {
                    setDraggingGroup(it.cards.map((x) => x.id));
                    setDraggingFromCol(col.id);
                    setDragMoved(false);
                  }}
                  onDrag={() => setDragMoved(true)}
                  onDragEnd={() => {
                    setDraggingGroup(null);
                    setDraggingFromCol(null);
                    setTimeout(() => setDragMoved(false), 0);
                  }}
                />
                {isOpen &&
                  it.cards.map((c) => (
                    <KanbanCard
                      key={c.id}
                      card={c}
                      colColor={col.color}
                      colIsDefault={col.is_default}
                      colIsDone={col.is_done}
                      producers={producers}
                      showCompany={false}
                      className="ml-4"
                      onTransfer={(producerId) => transferCard(c.id, producerId)}
                      onClick={() => {
                        if (!dragMoved) openEdit(c);
                      }}
                      onDragStart={() => {
                        setDragging(c.id);
                        setDraggingFromCol(col.id);
                        setDragMoved(false);
                      }}
                      onDrag={() => setDragMoved(true)}
                      onDragEnd={() => {
                        setDragging(null);
                        setDraggingFromCol(null);
                        setTimeout(() => setDragMoved(false), 0);
                      }}
                    />
                  ))}
              </div>
            );
          }
          const c = it.card;
          return (
            <div
              className="space-y-1"
              onDragOver={(e) => {
                if (draggingFromCol === col.id) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onDrop={(e) => {
                if (draggingFromCol !== col.id) {
                  resetDragState();
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                const ids = movingIds();
                if (ids.length && !ids.includes(c.id)) {
                  safeMutate(() => reorderInColumn(col.id, ids, c.id));
                } else {
                  resetDragState();
                }
              }}
            >
              <KanbanCardBadgesRow card={c} />
              <KanbanCard
                card={c}
                colColor={col.color}
                colIsDefault={col.is_default}
                colIsDone={col.is_done}
                producers={producers}
                onTransfer={(producerId) => transferCard(c.id, producerId)}
                onClick={() => {
                  if (!dragMoved) openEdit(c);
                }}
                onDragStart={() => {
                  setDragging(c.id);
                  setDraggingFromCol(col.id);
                  setDragMoved(false);
                }}
                onDrag={() => setDragMoved(true)}
                onDragEnd={() => {
                  setDragging(null);
                  setDraggingFromCol(null);
                  setTimeout(() => setDragMoved(false), 0);
                }}
              />
            </div>
          );
        }}
      />
    </div>
  );
}
