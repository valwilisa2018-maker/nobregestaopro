import logo from "@/assets/logo.png";

type NobreLoaderProps = {
  label?: string;
  fullScreen?: boolean;
  compact?: boolean;
  className?: string;
};

export function NobreLoader({
  label = "Carregando...",
  fullScreen = false,
  compact = false,
  className = "",
}: NobreLoaderProps) {
  return (
    <div
      className={`${fullScreen ? "min-h-screen" : "min-h-40"} flex items-center justify-center bg-background/95 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className="flex flex-col items-center gap-3">
        <div className={`nobre-loader-mark ${compact ? "h-12 w-12" : "h-20 w-20"}`}>
          <span className="nobre-loader-ring" aria-hidden="true" />
          <span className="nobre-loader-glow" aria-hidden="true" />
          <img
            src={logo}
            alt="Nobre MKT"
            className="relative z-10 h-[72%] w-[72%] rounded-full object-cover"
          />
        </div>
        {label && (
          <p className={`${compact ? "text-[11px]" : "text-xs"} font-medium tracking-wide text-muted-foreground animate-pulse`}>
            {label}
          </p>
        )}
      </div>
    </div>
  );
}
