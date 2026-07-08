import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { Info, AlertTriangle, CheckCircle2, Sparkles, ArrowRight } from "lucide-react";

type Ann = { id: string; title: string; body: string; severity: string; cta_label: string | null; cta_url: string | null };

const SEVERITY = {
  info:    { label: "Informação",  Icon: Info,           accent: "from-sky-500 via-blue-500 to-indigo-600",     ring: "ring-sky-500/30",     glow: "shadow-[0_0_60px_-10px_rgba(59,130,246,0.55)]",  chip: "bg-sky-500/15 text-sky-300 border-sky-500/30" },
  success: { label: "Novidade",    Icon: CheckCircle2,   accent: "from-emerald-500 via-teal-500 to-green-600",  ring: "ring-emerald-500/30", glow: "shadow-[0_0_60px_-10px_rgba(16,185,129,0.55)]", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  warning: { label: "Atenção",     Icon: AlertTriangle,  accent: "from-amber-500 via-orange-500 to-red-500",    ring: "ring-amber-500/30",   glow: "shadow-[0_0_60px_-10px_rgba(245,158,11,0.55)]", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  promo:   { label: "Exclusivo",   Icon: Sparkles,       accent: "from-fuchsia-500 via-purple-600 to-indigo-600", ring: "ring-fuchsia-500/30", glow: "shadow-[0_0_60px_-10px_rgba(217,70,239,0.55)]", chip: "bg-fuchsia-500/15 text-fuchsia-300 border-fuchsia-500/30" },
} as const;

export function AnnouncementModal() {
  const [current, setCurrent] = useState<Ann | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: anns } = await supabase.from("announcements").select("id,title,body,severity,cta_label,cta_url")
        .eq("is_active", true).order("created_at", { ascending: false }).limit(10);
      if (!anns?.length) return;
      const ids = anns.map(a => a.id);
      const { data: reads } = await supabase.from("announcement_reads").select("announcement_id")
        .eq("user_id", user.id).in("announcement_id", ids);
      const readIds = new Set((reads ?? []).map(r => r.announcement_id));
      const unread = anns.find(a => !readIds.has(a.id));
      if (unread) setCurrent(unread as Ann);
    })();
  }, []);

  const close = async () => {
    if (!current) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("announcement_reads").insert({ announcement_id: current.id, user_id: user.id });
    }
    setCurrent(null);
  };

  if (!current) return null;
  const cfg = (SEVERITY as Record<string, typeof SEVERITY.info>)[current.severity] ?? SEVERITY.info;
  const { Icon } = cfg;
  return (
    <Dialog open onOpenChange={(v) => !v && close()}>
      <DialogContent className={`p-0 overflow-hidden border-0 bg-transparent sm:max-w-lg ${cfg.glow}`}>
        <div className={`relative rounded-2xl bg-gradient-to-br ${cfg.accent} p-[1.5px] ring-1 ${cfg.ring}`}>
          <div className="relative rounded-2xl bg-[#0b0f1a]/95 backdrop-blur-xl overflow-hidden">
            {/* Glow orbs */}
            <div className={`pointer-events-none absolute -top-24 -right-24 h-56 w-56 rounded-full bg-gradient-to-br ${cfg.accent} opacity-30 blur-3xl`} />
            <div className={`pointer-events-none absolute -bottom-24 -left-24 h-56 w-56 rounded-full bg-gradient-to-br ${cfg.accent} opacity-20 blur-3xl`} />

            {/* Top gradient bar */}
            <div className={`h-1 w-full bg-gradient-to-r ${cfg.accent}`} />

            <div className="relative p-7">
              <div className="flex items-start gap-4">
                <div className={`shrink-0 h-12 w-12 grid place-items-center rounded-xl bg-gradient-to-br ${cfg.accent} shadow-lg`}>
                  <Icon className="h-6 w-6 text-white" strokeWidth={2.5} />
                </div>
                <div className="min-w-0 flex-1">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${cfg.chip}`}>
                    {cfg.label}
                  </span>
                  <h2 className="mt-2 text-xl font-bold text-white leading-tight">{current.title}</h2>
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <p className="text-sm leading-relaxed text-slate-200 whitespace-pre-wrap">{current.body}</p>
              </div>

              <div className="mt-6 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={close} className="text-slate-300 hover:text-white hover:bg-white/5">
                  Fechar
                </Button>
                {current.cta_url && current.cta_label ? (
                  <Button asChild className={`bg-gradient-to-r ${cfg.accent} text-white border-0 hover:opacity-90 shadow-lg`}>
                    <a href={current.cta_url} target="_blank" rel="noreferrer" onClick={() => close()}>
                      {current.cta_label}
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                ) : (
                  <Button onClick={close} className={`bg-gradient-to-r ${cfg.accent} text-white border-0 hover:opacity-90 shadow-lg`}>
                    Entendi
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}