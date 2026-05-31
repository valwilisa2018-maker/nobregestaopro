import { Card, CardContent } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Tone = "primary" | "success" | "warning" | "info" | "violet" | "amber";

const TONES: Record<Tone, { grad: string; glow: string; shadow: string; ring: string }> = {
  primary: {
    grad: "linear-gradient(135deg, oklch(0.58 0.22 25), oklch(0.45 0.20 25))",
    glow: "radial-gradient(ellipse at top, oklch(0.58 0.22 25 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.58 0.22 25 / 0.45)",
    ring: "oklch(0.58 0.22 25 / 0.5)",
  },
  success: {
    grad: "linear-gradient(135deg, oklch(0.72 0.19 150), oklch(0.55 0.17 150))",
    glow: "radial-gradient(ellipse at top, oklch(0.72 0.19 150 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.65 0.18 150 / 0.45)",
    ring: "oklch(0.65 0.18 150 / 0.5)",
  },
  warning: {
    grad: "linear-gradient(135deg, oklch(0.82 0.17 75), oklch(0.65 0.18 60))",
    glow: "radial-gradient(ellipse at top, oklch(0.78 0.17 75 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.75 0.17 70 / 0.45)",
    ring: "oklch(0.78 0.17 75 / 0.5)",
  },
  info: {
    grad: "linear-gradient(135deg, oklch(0.72 0.16 235), oklch(0.55 0.18 245))",
    glow: "radial-gradient(ellipse at top, oklch(0.65 0.17 240 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.65 0.17 240 / 0.45)",
    ring: "oklch(0.65 0.17 240 / 0.5)",
  },
  violet: {
    grad: "linear-gradient(135deg, oklch(0.68 0.20 295), oklch(0.50 0.22 295))",
    glow: "radial-gradient(ellipse at top, oklch(0.60 0.21 295 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.60 0.21 295 / 0.45)",
    ring: "oklch(0.60 0.21 295 / 0.5)",
  },
  amber: {
    grad: "linear-gradient(135deg, oklch(0.78 0.18 50), oklch(0.60 0.20 40))",
    glow: "radial-gradient(ellipse at top, oklch(0.72 0.19 45 / 0.18), transparent 70%)",
    shadow: "0 10px 40px -10px oklch(0.70 0.19 45 / 0.45)",
    ring: "oklch(0.72 0.19 45 / 0.5)",
  },
};

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  accent?: boolean;
  trend?: string;
  tone?: Tone;
}

export function StatCard({ label, value, icon: Icon, hint, accent, trend, tone = "primary" }: StatCardProps) {
  const t = TONES[tone];
  return (
    <Card
      className={cn(
        "group relative overflow-hidden border-2 transition-all duration-300",
        "hover:-translate-y-1 hover:scale-[1.02] animate-fade-in",
      )}
      style={{
        boxShadow: t.shadow,
        borderColor: accent ? t.ring : `color-mix(in oklch, ${t.ring} 40%, transparent)`,
      }}
    >
      {/* glow background — always on, brighter on accent */}
      <div
        className={cn("absolute inset-0 pointer-events-none transition-opacity duration-500",
          accent ? "opacity-90" : "opacity-40 group-hover:opacity-70")}
        style={{ background: t.glow }}
      />
      {/* top accent bar */}
      <div
        className="absolute top-0 left-0 right-0 h-1"
        style={{ background: t.grad }}
      />
      {/* shine sweep on hover */}
      <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 pointer-events-none"
        style={{ background: "linear-gradient(110deg, transparent 40%, oklch(1 0 0 / 0.08) 50%, transparent 60%)" }}
      />

      <CardContent className="p-4 md:p-5 relative">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 min-w-0 flex-1">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">
              {label}
            </p>
            <p
              className="text-sm md:text-base lg:text-lg font-black tracking-tight leading-tight whitespace-nowrap text-foreground"
            >
              {value}
            </p>
            {hint && <p className="text-[11px] text-muted-foreground/80">{hint}</p>}
          </div>
          <div
            className="w-8 h-8 md:w-9 md:h-9 rounded-lg flex items-center justify-center shrink-0 transition-transform duration-300 group-hover:scale-110 group-hover:rotate-6"
            style={{
              background: t.grad,
              boxShadow: t.shadow,
            }}
          >
            <Icon className="w-4 h-4 md:w-[18px] md:h-[18px] text-white drop-shadow" />
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