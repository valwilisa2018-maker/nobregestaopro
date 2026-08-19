import type { KanbanCardData, KanbanColumnData } from "./types";

export type OverdueSeverity = "warning" | "high" | "critical";

export interface OverdueProduction {
  card: KanbanCardData;
  column: KanbanColumnData;
  deliveryDate: string;
  daysLate: number;
  severity: OverdueSeverity;
}

export function getCardDeliveryDate(card: KanbanCardData): string | null {
  return (
    card.expected_delivery_date ??
    card.sales?.expected_delivery_date ??
    card.due_date ??
    null
  );
}

function localDate(date: string): Date | null {
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

export function getDaysLate(deliveryDate: string, now = new Date()): number {
  const due = localDate(deliveryDate);
  if (!due) return 0;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86_400_000));
}

export function getOverdueProductions(
  cards: KanbanCardData[],
  columns: KanbanColumnData[],
  now = new Date(),
): OverdueProduction[] {
  const columnsById = new Map(columns.map((column) => [column.id, column]));

  return cards
    .flatMap((card) => {
      const column = columnsById.get(card.column_id);
      const deliveryDate = getCardDeliveryDate(card);
      if (!column || column.is_done === true || card.delivered_at || !deliveryDate) return [];

      const daysLate = getDaysLate(deliveryDate, now);
      if (daysLate <= 3) return [];

      const severity: OverdueSeverity =
        daysLate >= 7 ? "critical" : daysLate >= 5 ? "high" : "warning";
      return [{ card, column, deliveryDate, daysLate, severity }];
    })
    .sort(
      (a, b) =>
        b.daysLate - a.daysLate ||
        a.deliveryDate.localeCompare(b.deliveryDate) ||
        a.card.title.localeCompare(b.card.title),
    );
}
