import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, ChevronLeft, ChevronRight, Clock3, CloudSun, Megaphone, Sparkles, Video } from "lucide-react";
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

export function DashboardHero({ deliveredToday, inProduction, pendingCount, pendingTotal, salesToday, salesTodayTotal }: DashboardHeroProps) {
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

  const slides = useMemo(() => [
    {
      key: "weather",
      icon: CloudSun,
      label: "Clima na sua localização",
      title: "Seu dia começa bem informado",
      content: <TopWeather />,
      detail: `Previsão atualizada pelo GPS • ${now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
      background: "/dashboard-telao/tecnologia-premium.png",
      accent: "from-sky-400 to-blue-500",
    },
    {
      key: "production",
      icon: Video,
      label: "Produção em tempo real",
      title: `${inProduction} produções em andamento`,
      content: <span className="text-base font-semibold text-white/90 sm:text-lg">{deliveredToday} vídeos entregues hoje pela equipe</span>,
      detail: "Movimentações sincronizadas diretamente com o Kanban",
      background: "/dashboard-telao/producao-audiovisual.png",
      accent: "from-violet-400 to-fuchsia-500",
    },
    {
      key: "sales",
      icon: Banknote,
      label: "Vendas e crescimento",
      title: money.format(salesTodayTotal),
      content: <span className="text-base font-semibold text-white/90 sm:text-lg">{salesToday} vendas realizadas hoje</span>,
      detail: `${pendingCount} recebimentos pendentes • ${money.format(pendingTotal)} a receber`,
      background: "/dashboard-telao/crescimento-vendas.png",
      accent: "from-amber-300 to-orange-500",
    },
    ...(announcement.data ? [{
      key: `announcement-${announcement.data.id}`,
      icon: Megaphone,
      label: "Comunicado da Nobre",
      title: announcement.data.title,
      content: <span className="line-clamp-2 max-w-2xl text-base font-medium leading-relaxed text-white/90 sm:text-lg">{announcement.data.message}</span>,
      detail: "Publicação oficial • Atualizado em tempo real",
      background: announcement.data.image_url || "/dashboard-telao/tecnologia-premium.png",
      accent: "from-red-400 to-rose-600",
    }] : []),
    {
      key: "clock",
      icon: Clock3,
      label: "Central Nobre",
      title: now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      content: <span className="text-base font-semibold capitalize text-white/90 sm:text-lg">{now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</span>,
      detail: "Gestão, vendas e produção conectadas em um só lugar",
      background: "/dashboard-telao/tecnologia-premium.png",
      accent: "from-red-400 to-rose-600",
    },
  ], [announcement.data, deliveredToday, inProduction, now, pendingCount, pendingTotal, salesToday, salesTodayTotal]);

  useEffect(() => {
    if (paused || slides.length < 2) return;
    const timer = window.setInterval(() => setActive((current) => (current + 1) % slides.length), 6_000);
    return () => window.clearInterval(timer);
  }, [paused, slides.length]);

  useEffect(() => { if (active >= slides.length) setActive(0); }, [active, slides.length]);

  const slide = slides[active] ?? slides[0];
  const Icon = slide.icon;
  const move = (direction: number) => setActive((current) => (current + direction + slides.length) % slides.length);

  return (
    <section
      aria-label="Central de informações ao vivo"
      className="group relative min-h-[270px] overflow-hidden rounded-3xl border border-white/10 bg-zinc-950 shadow-[0_18px_55px_-20px_rgba(220,38,38,0.48)] sm:min-h-[310px]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <img key={slide.background} src={slide.background} alt="" className="absolute inset-0 h-full w-full animate-in object-cover fade-in zoom-in-105 duration-1000" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/95 via-black/72 to-black/10" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/25" />
      <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-red-500 via-primary to-rose-700" />

      <div className="relative flex min-h-[270px] flex-col justify-between p-5 sm:min-h-[310px] sm:p-8 lg:p-10">
        <header className="flex items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/30 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-white/75 backdrop-blur-md">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" /></span>
            Central Nobre • Ao vivo
          </div>
          <div className="flex items-center gap-1 rounded-full border border-white/15 bg-black/30 p-1 backdrop-blur-md">
            <button type="button" aria-label="Informação anterior" onClick={() => move(-1)} className="rounded-full p-2 text-white/70 transition hover:bg-white/15 hover:text-white"><ChevronLeft className="h-4 w-4" /></button>
            <button type="button" aria-label="Próxima informação" onClick={() => move(1)} className="rounded-full p-2 text-white/70 transition hover:bg-white/15 hover:text-white"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </header>

        <div key={slide.key} className="max-w-3xl animate-in fade-in slide-in-from-left-5 duration-700">
          <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-white/70">
            <span className={cn("flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-lg", slide.accent)}><Icon className="h-4.5 w-4.5" /></span>
            {slide.label}
          </div>
          <h1 className="max-w-3xl text-3xl font-black leading-[1.05] tracking-tight text-white drop-shadow-2xl sm:text-5xl lg:text-6xl">{slide.title}</h1>
          <div className="mt-3">{slide.content}</div>
          <p className="mt-3 text-xs font-medium text-white/55 sm:text-sm">{slide.detail}</p>
        </div>

        <footer className="flex items-end justify-between gap-4">
          <div className="flex gap-2">
            {slides.map((item, index) => (
              <button key={item.key} type="button" aria-label={`Mostrar informação ${index + 1}`} onClick={() => setActive(index)} className={cn("h-1.5 rounded-full transition-all duration-300", index === active ? "w-10 bg-white" : "w-2 bg-white/30 hover:bg-white/60")} />
            ))}
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/45 sm:flex"><Sparkles className="h-3.5 w-3.5 text-red-400" />Dashboard inteligente Nobre MKT</div>
        </footer>
      </div>
    </section>
  );
}
