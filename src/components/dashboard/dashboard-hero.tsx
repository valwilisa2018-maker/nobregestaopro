import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CloudSun,
  Megaphone,
  Sparkles,
  Video,
} from "lucide-react";
import { TopWeather } from "@/components/top-weather";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type DashboardHeroProps = {
  deliveredToday: number;
  inProduction: number;
  pendingCount: number;
  pendingTotal: number;
  salesToday: number;
  salesTodayTotal: number;
};

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

export function DashboardHero({
  deliveredToday,
  inProduction,
  pendingCount,
  pendingTotal,
  salesToday,
  salesTodayTotal,
}: DashboardHeroProps) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const announcement = useQuery({
    queryKey: ["dashboard-live-announcement"],
    queryFn: async () => {
      const { data } = await supabase
        .from("system_announcements")
        .select("id,title,message,type,created_at,image_url")
        .eq("is_active", true)
        .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return data;
    },
  });

  useEffect(() => {
    const clock = window.setInterval(() => setNow(new Date()), 30_000);
    const channel = supabase
      .channel("dashboard-information-screen")
      .on("postgres_changes", { event: "*", schema: "public", table: "system_announcements" }, () =>
        queryClient.invalidateQueries({ queryKey: ["dashboard-live-announcement"] }),
      )
      .subscribe();
    return () => {
      window.clearInterval(clock);
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const slides = useMemo(
    () => [
      {
        key: "weather",
        icon: CloudSun,
        eyebrow: "Clima na sua localização",
        content: <TopWeather />,
        detail: `Atualizado automaticamente • ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        tone: "text-sky-500 bg-sky-500/10 border-sky-500/20",
      },
      {
        key: "production",
        icon: Video,
        eyebrow: "Produção agora",
        content: (
          <span className="text-sm font-bold text-foreground sm:text-base">
            {inProduction} em produção • {deliveredToday} entregues hoje
          </span>
        ),
        detail: "Dados atualizados pelo Kanban em tempo real",
        tone: "text-violet-500 bg-violet-500/10 border-violet-500/20",
      },
      {
        key: "sales",
        icon: Banknote,
        eyebrow: "Movimento de vendas",
        content: (
          <span className="text-sm font-bold text-foreground sm:text-base">
            {salesToday} vendas hoje • {money.format(salesTodayTotal)}
          </span>
        ),
        detail: `${pendingCount} recebimentos pendentes • ${money.format(pendingTotal)}`,
        tone: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
      },
      ...(announcement.data
        ? [
            {
              key: `announcement-${announcement.data.id}`,
              icon: Megaphone,
              eyebrow: "Comunicado da plataforma",
              content: (
                <span className="line-clamp-1 text-sm font-bold text-foreground sm:text-base">
                  {announcement.data.title}
                </span>
              ),
              detail: announcement.data.message,
              tone: "text-amber-500 bg-amber-500/10 border-amber-500/20",
            },
          ]
        : []),
      {
        key: "clock",
        icon: Clock3,
        eyebrow: "Agora na Nobre MKT",
        content: (
          <span className="text-lg font-black tabular-nums text-foreground">
            {now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
        ),
        detail: now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }),
        tone: "text-primary bg-primary/10 border-primary/20",
      },
    ],
    [
      announcement.data,
      deliveredToday,
      inProduction,
      now,
      pendingCount,
      pendingTotal,
      salesToday,
      salesTodayTotal,
    ],
  );

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(
      () => setActive((current) => (current + 1) % slides.length),
      5_000,
    );
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  useEffect(() => {
    if (active >= slides.length) setActive(0);
  }, [active, slides.length]);

  const slide = slides[active] ?? slides[0];
  const Icon = slide.icon;
  const move = (direction: number) =>
    setActive((current) => (current + direction + slides.length) % slides.length);

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-border/50 bg-gradient-to-br from-primary/10 via-card to-card p-6 sm:p-8"
      style={{ boxShadow: "0 10px 40px -12px oklch(0.55 0.20 25 / 0.35)" }}
    >
      <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-info/15 blur-3xl" />
      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Visão Geral
          </div>
          <h1 className="mt-3 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-3xl font-black tracking-tight text-transparent sm:text-4xl">
            Dashboard
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Vendas, produção e faturamento — atualizado em tempo real
          </p>
        </div>

        <section
          aria-label="Central de informações ao vivo"
          className="relative w-full overflow-hidden rounded-2xl border border-border/70 bg-card/75 shadow-lg backdrop-blur-xl lg:w-[510px]"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          {slide.key.startsWith("announcement-") && announcement.data?.image_url && (
            <>
              <img
                src={announcement.data.image_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-card via-card/90 to-card/35" />
            </>
          )}
          <div className="relative flex items-center justify-between border-b border-border/60 px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              Central Nobre • Ao vivo
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Informação anterior"
                onClick={() => move(-1)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Próxima informação"
                onClick={() => move(1)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
          <div
            key={slide.key}
            className="relative flex min-h-[88px] animate-in items-center gap-3 px-3 py-3 fade-in slide-in-from-right-3 duration-500 sm:px-4"
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border",
                slide.tone,
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-[0.13em] text-muted-foreground">
                {slide.eyebrow}
              </p>
              <div className="mt-1 min-w-0">{slide.content}</div>
              <p className="mt-1 line-clamp-1 text-[11px] capitalize text-muted-foreground">
                {slide.detail}
              </p>
            </div>
          </div>
          <div className="relative flex justify-center gap-1.5 pb-2.5">
            {slides.map((item, index) => (
              <button
                key={item.key}
                type="button"
                aria-label={`Mostrar informação ${index + 1}`}
                onClick={() => setActive(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === active ? "w-5 bg-primary" : "w-1.5 bg-muted-foreground/30",
                )}
              />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
