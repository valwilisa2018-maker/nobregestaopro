import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LayoutGrid } from "lucide-react";

interface PageShellProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  status?: "ativo" | "em-breve" | "beta";
}

export function PageShell({ title, description, icon, actions, children, status = "em-breve" }: PageShellProps) {
  const statusMap = {
    ativo: { label: "Ativo", cls: "bg-primary/15 text-primary border-primary/30" },
    "em-breve": { label: "Em breve", cls: "bg-muted text-muted-foreground border-border" },
    beta: { label: "Beta", cls: "bg-accent/40 text-primary border-primary/30" },
  } as const;
  const s = statusMap[status];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/20 p-4 sm:p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3 sm:flex sm:flex-wrap sm:justify-between sm:gap-4">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            <div className="grid h-10 w-10 sm:h-12 sm:w-12 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              {icon ?? <LayoutGrid className="h-6 w-6" />}
            </div>
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate max-w-full">{title}</h1>
                <Badge variant="outline" className={s.cls}>{s.label}</Badge>
              </div>
              {description && <p className="text-xs sm:text-sm text-muted-foreground max-w-2xl">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap justify-end">{actions}</div>}
        </div>
      </div>
      {children ?? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-2">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <LayoutGrid className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-semibold">Módulo em construção</h2>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Este módulo faz parte da plataforma e será liberado em breve com todos os recursos premium de atendimento.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}