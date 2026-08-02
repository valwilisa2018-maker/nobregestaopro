import { useRef, type ReactElement, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cloneElement, isValidElement } from "react";
import { cn } from "@/lib/utils";

/**
 * Lista vertical virtualizada: renderiza apenas os itens visíveis (mais um
 * overscan) para manter o DOM pequeno e o uso de memória baixo em listas longas.
 *
 * Abaixo de `threshold` itens a lista é renderizada normalmente (sem container
 * de scroll), para que listas curtas continuem com o mesmo layout de antes.
 */
export function VirtualList<T>({
  items,
  renderItem,
  keyFor,
  estimateSize = 120,
  gap = 8,
  overscan = 6,
  threshold = 30,
  className,
  style,
  emptyState,
}: {
  items: T[];
  renderItem: (item: T, index: number) => ReactNode;
  keyFor: (item: T, index: number) => string;
  estimateSize?: number;
  gap?: number;
  overscan?: number;
  threshold?: number;
  className?: string;
  style?: React.CSSProperties;
  emptyState?: ReactNode;
}) {
  const parentRef = useRef<HTMLDivElement>(null);
  const virtualize = items.length > threshold;

  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => estimateSize,
    overscan,
    gap,
  });

  if (!items.length) return <>{emptyState ?? null}</>;

  if (!virtualize) {
    return (
      <div className={className} style={style}>
        {items.map((item, i) => (
          <div key={keyFor(item, i)} style={i > 0 ? { marginTop: gap } : undefined}>
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div ref={parentRef} className={cn("overflow-y-auto overflow-x-hidden", className)} style={style}>
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => {
          const item = items[row.index];
          return (
            <div
              key={keyFor(item, row.index)}
              data-index={row.index}
              ref={virtualizer.measureElement}
              className="absolute left-0 top-0 w-full"
              style={{ transform: `translateY(${row.start}px)` }}
            >
              {renderItem(item, row.index)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Linhas de tabela virtualizadas. Deve ser usado dentro de <TableBody>, com
 * `scrollRef` apontando para o container com overflow que envolve a <Table>.
 * `renderRow` precisa devolver um <TableRow> (que aceita ref) para medição.
 */
export function VirtualTableRows<T>({
  items,
  renderRow,
  keyFor,
  scrollRef,
  colSpan,
  estimateSize = 64,
  overscan = 8,
  threshold = 40,
}: {
  items: T[];
  renderRow: (item: T, index: number) => ReactElement;
  keyFor: (item: T, index: number) => string;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  colSpan: number;
  estimateSize?: number;
  overscan?: number;
  threshold?: number;
}) {
  const virtualize = items.length > threshold;

  const virtualizer = useVirtualizer({
    count: virtualize ? items.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan,
  });

  if (!virtualize) {
    return <>{items.map((item, i) => <Keyed key={keyFor(item, i)}>{renderRow(item, i)}</Keyed>)}</>;
  }

  const rows = virtualizer.getVirtualItems();
  const paddingTop = rows.length ? rows[0].start : 0;
  const paddingBottom = rows.length
    ? virtualizer.getTotalSize() - rows[rows.length - 1].end
    : 0;

  return (
    <>
      {paddingTop > 0 && (
        <tr aria-hidden>
          <td colSpan={colSpan} style={{ height: paddingTop, padding: 0, border: 0 }} />
        </tr>
      )}
      {rows.map((row) => {
        const item = items[row.index];
        const element = renderRow(item, row.index);
        return isValidElement(element)
          ? cloneElement(element as ReactElement<Record<string, unknown>>, {
              key: keyFor(item, row.index),
              "data-index": row.index,
              ref: virtualizer.measureElement,
            })
          : element;
      })}
      {paddingBottom > 0 && (
        <tr aria-hidden>
          <td colSpan={colSpan} style={{ height: paddingBottom, padding: 0, border: 0 }} />
        </tr>
      )}
    </>
  );
}

function Keyed({ children }: { children: ReactNode }) {
  return <>{children}</>;
}