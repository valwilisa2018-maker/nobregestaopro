import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  accent?: boolean;
  trend?: string;
}

export function StatCard({ label, value, icon: Icon, hint, accent, trend }: StatCardProps) {
  return (
    <Card className={cn("relative overflow-hidden border-border/50 transition-all hover:border-primary/40",
      accent && "border-primary/40")}
      style={{ boxShadow: "var(--shadow-card)" }}>
      {accent && (
        <div className="absolute inset-0 opacity-50 pointer-events-none"
          style={{ background: "var(--gradient-glow)" }} />
      )}
      <CardContent className="p-5 relative">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{label}</p>
            <p className="text-2xl font-bold tracking-tight text-foreground">{value}</p>
            {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
          </div>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={accent
              ? { background: "var(--gradient-primary)", boxShadow: "var(--shadow-premium)" }
              : { background: "oklch(0.20 0.008 270)" }}>
            <Icon className={cn("w-5 h-5", accent ? "text-primary-foreground" : "text-primary")} />
          </div>
        </div>
        {trend && (
          <div className="mt-3 text-xs text-success font-medium">{trend}</div>
        )}
      </CardContent>
    </Card>
  );
}