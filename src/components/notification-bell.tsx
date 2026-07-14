import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Check, CheckCheck, X, Info, AlertTriangle, CircleCheck, CircleAlert, Sparkles } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Notification = { id: string; title: string; body: string | null; type: string; link: string | null; read_at: string | null; created_at: string };

const typeStyles: Record<string, { icon: React.ComponentType<{ className?: string }>; ring: string; bg: string; fg: string }> = {
  success: { icon: CircleCheck, ring: "ring-emerald-500/30", bg: "bg-emerald-500/15", fg: "text-emerald-400" },
  error:   { icon: CircleAlert, ring: "ring-red-500/30",     bg: "bg-red-500/15",     fg: "text-red-400" },
  warning: { icon: AlertTriangle, ring: "ring-amber-500/30", bg: "bg-amber-500/15",   fg: "text-amber-400" },
  info:    { icon: Info,        ring: "ring-sky-500/30",     bg: "bg-sky-500/15",     fg: "text-sky-400" },
};

function relTime(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "agora";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  if (diff < 604800) return `há ${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function NotificationBell() {
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let userId: string | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;

    const dedupe = (arr: Notification[]) => {
      const seen = new Set<string>();
      return arr.filter(n => (seen.has(n.id) ? false : (seen.add(n.id), true)));
    };

    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      userId = user.id;
      const { data } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(30);
      if (cancelled) return;
      setItems(dedupe((data as Notification[]) ?? []));

      channel = supabase.channel(`notifications-bell-${userId}`)
        .on("postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as Notification;
            setItems(prev => dedupe([n, ...prev]).slice(0, 30));
          })
        .on("postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as Notification;
            setItems(prev => prev.map(x => x.id === n.id ? { ...x, ...n } : x));
          })
        .on("postgres_changes",
          { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const oldId = (payload.old as { id?: string }).id;
            if (oldId) setItems(prev => prev.filter(x => x.id !== oldId));
          })
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const visible = useMemo(() => items.filter(n => !n.read_at), [items]);
  const unread = visible.length;

  const markOne = async (id: string) => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.id === id ? { ...n, read_at: now } : n));
    await supabase.from("notifications").update({ read_at: now }).eq("id", id).is("read_at", null);
  };

  const markAll = async () => {
    const now = new Date().toISOString();
    setItems(prev => prev.map(n => n.read_at ? n : { ...n, read_at: now }));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null).eq("user_id", user.id);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative hover:bg-primary/10">
          <Bell className={cn("h-4 w-4 transition-transform", unread > 0 && "animate-[wiggle_1s_ease-in-out_infinite]")} />
          <AnimatePresence>
            {unread > 0 && (
              <motion.span
                initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-pink-600 px-1 text-[10px] font-bold text-foreground shadow-lg shadow-red-500/50 ring-2 ring-background"
              >
                {unread > 99 ? "99+" : unread}
              </motion.span>
            )}
          </AnimatePresence>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} className="w-[92vw] max-w-sm p-0 overflow-hidden border-border/60 bg-gradient-to-b from-background to-background/80 backdrop-blur-xl shadow-2xl">
        <div className="relative px-4 py-3 border-b border-border/60 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-primary/15 text-primary ring-1 ring-primary/25">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold leading-tight truncate">Notificações</div>
                <div className="text-[10px] text-muted-foreground">{unread > 0 ? `${unread} não lidas` : "Tudo em dia"}</div>
              </div>
            </div>
            {unread > 0 && (
              <Button size="sm" variant="outline" onClick={markAll} className="h-8 gap-1.5 rounded-full border-primary/30 bg-primary/5 text-xs hover:bg-primary/15">
                <CheckCheck className="h-3.5 w-3.5" /> Marcar todas
              </Button>
            )}
          </div>
        </div>

        <div className="max-h-[70vh] sm:max-h-[28rem] overflow-y-auto">
          <AnimatePresence initial={false} mode="popLayout">
            {visible.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center"
              >
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-muted/40 ring-1 ring-border">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-sm font-medium">Sem notificações</div>
                <div className="text-xs text-muted-foreground">Você está em dia! 🎉</div>
              </motion.div>
            ) : (
              visible.map(n => {
                const style = typeStyles[n.type] ?? typeStyles.info;
                const Icon = style.icon;
                return (
                  <motion.div
                    key={n.id}
                    layout
                    initial={{ opacity: 0, x: 20, height: 0 }}
                    animate={{ opacity: 1, x: 0, height: "auto" }}
                    exit={{ opacity: 0, x: -120, scale: 0.9, transition: { duration: 0.22 } }}
                    transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    className="group relative border-b border-border/50 last:border-b-0"
                  >
                    <div className="flex items-start gap-3 p-3 hover:bg-muted/40 transition-colors">
                      <div className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl ring-1", style.bg, style.ring)}>
                        <Icon className={cn("h-4 w-4", style.fg)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-sm font-semibold leading-tight truncate">{n.title}</div>
                          <div className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0">{relTime(n.created_at)}</div>
                        </div>
                        {n.body && <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</div>}
                        <div className="mt-1.5 flex items-center gap-3">
                          {n.link && (
                            <Link to={n.link} onClick={() => { markOne(n.id); setOpen(false); }} className="text-[11px] font-medium text-primary hover:underline">
                              Abrir →
                            </Link>
                          )}
                          <button onClick={() => markOne(n.id)} className="text-[11px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                            <Check className="h-3 w-3" /> Marcar como lida
                          </button>
                        </div>
                      </div>
                      <button
                        onClick={() => markOne(n.id)}
                        aria-label="Dispensar"
                        className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 grid place-items-center rounded-md hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <span className="absolute left-0 top-3 bottom-3 w-0.5 rounded-r bg-gradient-to-b from-primary to-primary/40" />
                  </motion.div>
                );
              })
            )}
          </AnimatePresence>
        </div>
      </PopoverContent>
    </Popover>
  );
}