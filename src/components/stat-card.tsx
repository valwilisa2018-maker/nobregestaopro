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
    <Card
      className={cn(
        "group relative overflow-hidden border-2 border-primary/20 transition-all duration-300",
        "hover:border-primary/60 hover:-translate-y-1 hover:scale-[1.02] animate-fade-in",
        accent && "border-primary/50",
      )}
      style={{ boxShadow: "var(--shadow-premium)" }}
    >
      {/* glow background — always on, brighter on accent */}
      <div
        className={cn("absolute inset-0 pointer-events-none transition-opacity duration-500",
          accent ? "opacity-90" : "opacity-40 group-hover:opacity-70")}
        style={{ background: "var(--gradient-glow)" }}
      />
      {/* top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: "var(--gradient-primary)" }}
      />
      {/* shine sweep on hover */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none"
        style={{ background: "linear-gradient(110deg, transparent 40%, oklch(1 0 0 / 0.08) 50%, transparent 60%)" }}
      />

      <CardContent className="p-6 relative">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2 min-w-0 flex-1">
            <p className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground font-semibold">
              {label}
            </p>
            <p
              className="text-3xl md:text-4xl font-black tracking-tight leading-none truncate"
              style={{
                backgroundImage: "var(--gradient-primary)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {value}
            </p>
            {hint && <p className="text-xs text-muted-foreground/80">{hint}</p>}
          </div>
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
            style={{
              background: "var(--gradient-primary)",
              boxShadow: "var(--shadow-premium)",
            }}
          >
            <Icon className="w-7 h-7 text-primary-foreground drop-shadow" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 inline-flex items-center gap-1 text-xs text-success font-semibold bg-success/10 px-2 py-1 rounded-md">
            {trend}
          </div>
        )}
      </CardContent>
    </Card>
  );
}