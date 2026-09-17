// Etiqueta compacta de classificação da venda (Ticket Alto / Ticket Baixo).
// Independente do status de pagamento; vendas antigas sem valor não exibem nada.

export type TicketType = "high" | "low";

export const TICKET_TYPE_OPTIONS: { value: TicketType; label: string }[] = [
  { value: "high", label: "Ticket Alto" },
  { value: "low", label: "Ticket Baixo" },
];

export function ticketTypeLabel(value?: string | null): string | null {
  return TICKET_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? null;
}

export interface TicketTypeBadgeProps {
  value?: string | null;
  className?: string;
}

export function TicketTypeBadge({ value, className = "" }: TicketTypeBadgeProps) {
  const label = ticketTypeLabel(value);
  if (!label) return null;
  const isHigh = value === "high";
  return (
    <span
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold leading-none ${
        isHigh
          ? "border-emerald-500/30 bg-emerald-500/12 text-emerald-600 dark:text-emerald-400"
          : "border-red-500/30 bg-red-500/12 text-red-600 dark:text-red-400"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`h-1.5 w-1.5 rounded-full ${isHigh ? "bg-emerald-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}
