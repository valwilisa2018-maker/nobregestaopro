import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/**
 * Estados de carregamento e vazio para listas virtualizadas.
 * Skeletons imitam a altura/estrutura real das linhas para evitar "salto"
 * de layout quando os dados chegam.
 */

export function TableSkeletonRows({
  rows = 8,
  columns,
}: {
  rows?: number;
  columns: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <TableRow key={r} className="hover:bg-transparent">
          {Array.from({ length: columns }).map((_, c) => (
            <TableCell key={c} className="py-4">
              <Skeleton
                className={cn(
                  "h-4",
                  c === 0 ? "w-32" : c === columns - 1 ? "w-6" : "w-20",
                )}
              />
              {c === 1 && <Skeleton className="mt-2 h-3 w-14" />}
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

export function TableEmptyRow({
  colSpan,
  title,
  description,
  icon,
  action,
}: {
  colSpan: number;
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="py-14">
        <EmptyState title={title} description={description} icon={icon} action={action} />
      </TableCell>
    </TableRow>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center text-center gap-2", className)}>
      {icon && (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
          {icon}
        </div>
      )}
      <p className="text-sm font-semibold text-foreground/80">{title}</p>
      {description && (
        <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function CardGridSkeleton({
  count = 6,
  className,
}: {
  count?: number;
  className?: string;
}) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className={cn("border-border/50", className)}>
          <CardContent className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-4/5" />
            <div className="flex items-center justify-between pt-2">
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-8 w-16 rounded-md" />
            </div>
          </CardContent>
        </Card>
      ))}
    </>
  );
}

/** Skeleton de cards curtos, usado nas colunas do Kanban. */
export function KanbanCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border/60 bg-card p-3 space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-2 pt-1">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-10 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}