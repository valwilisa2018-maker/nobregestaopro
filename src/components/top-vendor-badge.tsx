import { Rocket, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

interface TopVendorBadgeProps {
  rank?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

/**
 * Premium badge for the top vendor — combines a trophy halo with a rocket icon,
 * animated gradient sheen and a soft pulsing glow.
 */
export function TopVendorBadge({ rank = 1, size = "md", className }: TopVendorBadgeProps) {
  const dims =
    size === "sm" ? "w-8 h-8" : size === "lg" ? "w-14 h-14" : "w-10 h-10";
  const rocketSize =
    size === "sm" ? "w-3.5 h-3.5" : size === "lg" ? "w-6 h-6" : "w-4 h-4";
  const trophySize =
    size === "sm" ? "w-2.5 h-2.5" : size === "lg" ? "w-4 h-4" : "w-3 h-3";

  return (
    <div
      className={cn(
        "relative shrink-0 group/badge",
        dims,
        className,
      )}
      aria-label={`Top vendedor #${rank}`}
    >
      {/* Pulsing glow halo */}
      <div
        className="absolute inset-0 rounded-full blur-md opacity-70 animate-pulse"
        style={{
          background:
            "radial-gradient(circle, oklch(0.78 0.18 50 / 0.7), transparent 70%)",
        }}
      />

      {/* Rotating conic ring */}
      <div
        className="absolute -inset-[2px] rounded-full opacity-90 animate-[spin_6s_linear_infinite]"
        style={{
          background:
            "conic-gradient(from 0deg, oklch(0.82 0.17 75), oklch(0.58 0.22 25), oklch(0.82 0.17 75))",
          maskImage:
            "radial-gradient(circle, transparent 58%, black 60%)",
          WebkitMaskImage:
            "radial-gradient(circle, transparent 58%, black 60%)",
        }}
      />

      {/* Main coin */}
      <div
        className={cn(
          "relative rounded-full flex items-center justify-center",
          "transition-transform duration-300 group-hover/badge:scale-110 group-hover/badge:rotate-6",
          dims,
        )}
        style={{
          background:
            "linear-gradient(135deg, oklch(0.85 0.17 80), oklch(0.65 0.20 40) 55%, oklch(0.50 0.22 25))",
          boxShadow:
            "0 6px 18px -4px oklch(0.65 0.20 40 / 0.6), inset 0 1px 0 oklch(1 0 0 / 0.4), inset 0 -2px 4px oklch(0 0 0 / 0.25)",
        }}
      >
        {/* Shine sweep */}
        <div
          className="absolute inset-0 rounded-full overflow-hidden pointer-events-none"
        >
          <div
            className="absolute -inset-y-2 -left-1/2 w-1/2 rotate-12 opacity-60 animate-[shine_3s_ease-in-out_infinite]"
            style={{
              background:
                "linear-gradient(90deg, transparent, oklch(1 0 0 / 0.55), transparent)",
            }}
          />
        </div>

        {/* Rocket icon */}
        <Rocket
          className={cn(rocketSize, "relative text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.4)] -rotate-12")}
          strokeWidth={2.5}
        />

        {/* Trophy mini-badge */}
        <div
          className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center ring-2 ring-background"
          style={{
            width: size === "lg" ? "20px" : size === "sm" ? "12px" : "16px",
            height: size === "lg" ? "20px" : size === "sm" ? "12px" : "16px",
            background:
              "linear-gradient(135deg, oklch(0.92 0.15 95), oklch(0.70 0.18 70))",
            boxShadow: "0 2px 6px -1px oklch(0.50 0.20 40 / 0.6)",
          }}
        >
          <Trophy className={cn(trophySize, "text-amber-900")} strokeWidth={3} />
        </div>
      </div>
    </div>
  );
}