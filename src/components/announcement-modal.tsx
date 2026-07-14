import { useEffect, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { supabase } from "@/integrations/supabase/client";
import { Info, AlertTriangle, CheckCircle2, Sparkles, Check, FileText, X, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Ann = { id: string; title: string; body: string; severity: string; cta_label: string | null; cta_url: string | null; created_at?: string };

type SeverityConfig = {
  label: string;
  Icon: LucideIcon;
  ring: string;       // ring color (hex/rgb) for glow
  gradFrom: string;   // tailwind class for gradient text/button start
  gradTo: string;     // tailwind class for gradient text/button end
  sparkleA: string;
  sparkleB: string;
};

const SEVERITY: Record<string, SeverityConfig> = {
  success: { label: "Sucesso",   Icon: CheckCircle2,  ring: "rgba(16,185,129,0.65)", gradFrom: "from-emerald-400", gradTo: "to-sky-400",     sparkleA: "bg-emerald-400", sparkleB: "bg-sky-400" },
  info:    { label: "Informação", Icon: Info,          ring: "rgba(56,189,248,0.65)", gradFrom: "from-sky-400",     gradTo: "to-blue-500",    sparkleA: "bg-sky-400",     sparkleB: "bg-blue-500" },
  warning: { label: "Atenção",   Icon: AlertTriangle, ring: "rgba(245,158,11,0.65)", gradFrom: "from-amber-400",   gradTo: "to-orange-500",  sparkleA: "bg-amber-400",   sparkleB: "bg-orange-500" },
  promo:   { label: "Exclusivo", Icon: Sparkles,      ring: "rgba(217,70,239,0.65)", gradFrom: "from-fuchsia-400", gradTo: "to-indigo-500",  sparkleA: "bg-fuchsia-400", sparkleB: "bg-indigo-500" },
};

function Sparkle({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <span className={cn("absolute block rotate-45 rounded-[1px]", className)} style={style} />;
}

export function AnnouncementModal() {
  const [current, setCurrent] = useState<Ann | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: anns } = await supabase.from("announcements").select("id,title,body,severity,cta_label,cta_url,created_at")
        .eq("is_active", true).neq("severity", "maintenance").order("created_at", { ascending: false }).limit(10);
      if (!anns?.length) return;
      const ids = anns.map(a => a.id);
      const { data: reads } = await supabase.from("announcement_reads").select("announcement_id")
        .eq("user_id", user.id).in("announcement_id", ids);
      const readIds = new Set((reads ?? []).map(r => r.announcement_id));
      const unread = anns.find(a => !readIds.has(a.id));
      if (unread) setCurrent(unread as Ann);
    })();
  }, []);

  useEffect(() => { setShowDetails(false); }, [current?.id]);

  const close = async () => {
    if (!current) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("announcement_reads").insert({ announcement_id: current.id, user_id: user.id });
    }
    setCurrent(null);
  };

  if (!current) return null;
  const cfg = SEVERITY[current.severity] ?? SEVERITY.info;
  const { Icon } = cfg;
  const dateStr = current.created_at
    ? new Date(current.created_at).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit", year: "numeric" })
    : null;

  return (
    <DialogPrimitive.Root open onOpenChange={(v) => !v && close()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95"
        >
          <DialogPrimitive.Title className="sr-only">{current.title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{current.body}</DialogPrimitive.Description>

          <div className="relative rounded-[28px] border border-border bg-card p-8 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
            {/* subtle inner gradient */}
            <div className="pointer-events-none absolute inset-0 rounded-[28px] bg-[radial-gradient(ellipse_at_top,rgba(56,189,248,0.06),transparent_60%)]" />

            {/* Close */}
            <DialogPrimitive.Close className="absolute right-5 top-5 z-10 grid h-9 w-9 place-items-center rounded-full bg-muted/40 text-foreground/70 ring-1 ring-border transition hover:bg-muted/60 hover:text-foreground">
              <X className="h-4 w-4" />
            </DialogPrimitive.Close>

            {/* Icon with rings + sparkles */}
            <div className="relative mx-auto mt-2 mb-6 h-28 w-28">
              <div className="absolute inset-0 rounded-full" style={{ boxShadow: `0 0 60px 8px ${cfg.ring}` }} />
              <div className="absolute inset-2 rounded-full border" style={{ borderColor: cfg.ring }} />
              <div className="absolute inset-5 rounded-full bg-card ring-1 ring-border grid place-items-center">
                <Icon className="h-9 w-9 text-foreground" strokeWidth={2.5} />
              </div>
              {/* sparkles */}
              <Sparkle className={cn("h-1.5 w-1.5", cfg.sparkleA)} style={{ top: "-4px",  left: "18%" }} />
              <Sparkle className={cn("h-1 w-1",     cfg.sparkleB)} style={{ top: "10%",   right: "-6px" }} />
              <Sparkle className={cn("h-2 w-2",     cfg.sparkleA)} style={{ top: "-8px",  right: "22%" }} />
              <Sparkle className={cn("h-1 w-1",     cfg.sparkleB)} style={{ top: "40%",   left: "-8px" }} />
              <Sparkle className={cn("h-1.5 w-1.5", cfg.sparkleA)} style={{ bottom: "0",  right: "-4px" }} />
              <Sparkle className={cn("h-1 w-1",     cfg.sparkleB)} style={{ top: "-2px",  left: "48%" }} />
            </div>

            {/* Title */}
            <h2 className="relative text-center text-3xl font-bold leading-tight text-foreground">
              {current.title.split(" ").slice(0, Math.ceil(current.title.split(" ").length / 2)).join(" ")}{" "}
              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", cfg.gradFrom, cfg.gradTo)}>
                {current.title.split(" ").slice(Math.ceil(current.title.split(" ").length / 2)).join(" ") || current.title}
              </span>
            </h2>

            {/* Body */}
            <p className={cn(
              "relative mx-auto mt-3 max-w-sm text-center text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap",
              !showDetails && "line-clamp-2"
            )}>
              {current.body}
            </p>

            {/* Details card */}
            {showDetails ? (
              <div className="relative mt-6 rounded-2xl border border-border bg-white/[0.03] p-4 space-y-3 max-h-[45vh] overflow-y-auto">
                <div className="flex items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-gradient-to-r text-foreground", cfg.gradFrom, cfg.gradTo)}>
                    {cfg.label}
                  </span>
                  {dateStr && <span className="text-[11px] text-muted-foreground">Publicado em {dateStr}</span>}
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Mensagem completa</p>
                  <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap">{current.body}</p>
                </div>
                {current.cta_url && (
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Link relacionado</p>
                    <a href={current.cta_url} target="_blank" rel="noreferrer" className="text-sm text-sky-400 hover:underline break-all">
                      {current.cta_url}
                    </a>
                  </div>
                )}
              </div>
            ) : dateStr && (
              <div className="relative mt-6 flex items-start gap-3 rounded-2xl border border-border bg-white/[0.03] p-4">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-sky-500/15 ring-1 ring-sky-500/30">
                  <Info className="h-5 w-5 text-sky-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">Detalhes</p>
                  <p className="text-xs text-muted-foreground">Publicado em {dateStr}. Clique em "Ver detalhes" para ler tudo.</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="relative mt-6 grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowDetails(v => !v)}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-xl border border-border bg-white/[0.03] text-sm font-semibold text-foreground transition hover:bg-white/[0.06]"
              >
                <FileText className="h-4 w-4 text-sky-400" />
                {showDetails ? "Ocultar detalhes" : "Ver detalhes"}
              </button>
              <button
                onClick={close}
                className={cn(
                  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-gradient-to-r text-sm font-semibold text-foreground shadow-lg transition hover:opacity-95",
                  cfg.gradFrom,
                  cfg.gradTo,
                )}
              >
                <Check className="h-4 w-4" strokeWidth={3} />
                Entendido
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}