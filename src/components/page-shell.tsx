import { type ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles } from "lucide-react";

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
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/20 p-6">
        <div className="absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/30">
              {icon ?? <Sparkles className="h-6 w-6" />}
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                <Badge variant="outline" className={s.cls}>{s.label}</Badge>
              </div>
              {description && <p className="text-sm text-muted-foreground max-w-2xl">{description}</p>}
            </div>
          </div>
          {actions}
        </div>
      </div>
      {children ?? (
        <Card className="border-dashed">
          <CardContent className="py-16 text-center space-y-2">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="h-6 w-6" />
            </div>
            <h3 className="text-lg font-semibold">Módulo em construção</h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Este módulo faz parte da plataforma e será liberado em breve com todos os recursos premium de atendimento.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}