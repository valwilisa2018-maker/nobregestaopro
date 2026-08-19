import { describe, expect, it } from "vitest";
import { getDaysLate, getOverdueProductions } from "../overdue";
import type { KanbanCardData, KanbanColumnData } from "../types";

const columns: KanbanColumnData[] = [
  { id: "todo", name: "Produção", color: "#f59e0b", is_done: false },
  { id: "done", name: "Entregue", color: "#10b981", is_done: true },
];

function card(overrides: Partial<KanbanCardData> = {}): KanbanCardData {
  return {
    id: "card-1",
    title: "Cliente • Vídeo 01",
    description: null,
    column_id: "todo",
    due_date: null,
    due_time: null,
    color: null,
    labels: null,
    google_drive_link: null,
    platform_link: null,
    sale_id: null,
    producer_id: null,
    expected_delivery_date: "2026-08-10",
    video_duration_seconds: 30,
    delivered_at: null,
    created_at: "2026-08-01T12:00:00Z",
    sort_order: 10,
    producer: null,
    sales: null,
    ...overrides,
  };
}

describe("telão de atrasos do Kanban", () => {
  it("calcula dias de atraso por data de calendário", () => {
    expect(getDaysLate("2026-08-10", new Date(2026, 7, 18, 18))).toBe(8);
  });

  it("mostra somente cards não concluídos com mais de 3 dias e ordena o maior atraso", () => {
    const result = getOverdueProductions(
      [
        card({ id: "late-4", expected_delivery_date: "2026-08-14" }),
        card({ id: "late-8", expected_delivery_date: "2026-08-10" }),
        card({ id: "only-3", expected_delivery_date: "2026-08-15" }),
        card({ id: "done", column_id: "done", expected_delivery_date: "2026-08-01" }),
        card({ id: "delivered", delivered_at: "2026-08-12T12:00:00Z" }),
      ],
      columns,
      new Date(2026, 7, 18, 18),
    );

    expect(result.map((item) => item.card.id)).toEqual(["late-8", "late-4"]);
    expect(result.map((item) => item.severity)).toEqual(["critical", "warning"]);
  });

  it("usa o prazo da venda quando o card não possui data própria", () => {
    const result = getOverdueProductions(
      [
        card({
          expected_delivery_date: null,
          sales: {
            total_amount: null,
            paid_amount: null,
            payment_status: null,
            google_drive_link: null,
            platform_link: null,
            producer_id: null,
            expected_delivery_date: "2026-08-11",
            video_duration_seconds: null,
            customers: null,
            sellers: null,
            producers: null,
          },
        }),
      ],
      columns,
      new Date(2026, 7, 18),
    );
    expect(result[0]?.daysLate).toBe(7);
  });
});
