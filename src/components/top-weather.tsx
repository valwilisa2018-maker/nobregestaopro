import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Loader2,
  Sun,
} from "lucide-react";
import { useWeather } from "@/hooks/use-weather";

function getWeatherMeta(code: number, isDay: boolean) {
  if (code === 0) {
    return {
      icon: isDay ? Sun : CloudMoon,
      label: isDay ? "Ensolarado" : "Ceu limpo",
    };
  }

  if (code === 1 || code === 2) {
    return {
      icon: isDay ? CloudSun : CloudMoon,
      label: "Parcial nublado",
    };
  }

  if (code === 3) {
    return {
      icon: Cloud,
      label: "Nublado",
    };
  }

  if (code === 45 || code === 48) {
    return {
      icon: CloudFog,
      label: "Nevoeiro",
    };
  }

  if ([51, 53, 55, 56, 57].includes(code)) {
    return {
      icon: CloudDrizzle,
      label: "Garoa",
    };
  }

  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) {
    return {
      icon: CloudRain,
      label: "Chuva",
    };
  }

  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return {
      icon: CloudSnow,
      label: "Neve",
    };
  }

  if ([95, 96, 99].includes(code)) {
    return {
      icon: CloudLightning,
      label: "Trovoadas",
    };
  }

  return {
    icon: Cloud,
    label: "Tempo variavel",
  };
}

export function TopWeather() {
  const state = useWeather();

  if (state.status === "loading" && !state.data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
        <Loader2 className="h-3 w-3 animate-spin text-primary" />
        <span className="hidden sm:inline">Clima</span>
      </span>
    );
  }

  if (state.status === "error" && !state.data) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
        <Cloud className="h-3 w-3 text-muted-foreground" />
        <span className="hidden sm:inline">Clima indisponivel</span>
      </span>
    );
  }

  const weather = state.data!;
  const meta = getWeatherMeta(weather.weatherCode, weather.isDay);
  const Icon = meta.icon;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-2.5 py-1 text-[11px] font-medium text-muted-foreground backdrop-blur">
      <Icon className="h-3 w-3 text-sky-400" />
      <span className="font-semibold text-foreground">{weather.temperature}C</span>
      <span className="hidden md:inline">{meta.label}</span>
      <span className="hidden xl:inline text-muted-foreground/80">
        Max {weather.maxTemp}C Min {weather.minTemp}C
      </span>
      <span className="hidden sm:inline max-w-40 truncate border-l border-border/60 pl-1.5 text-[9px] uppercase tracking-[0.12em] text-muted-foreground/80">
        {weather.label}
      </span>
    </span>
  );
}
