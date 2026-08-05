import { useEffect, useRef, useState } from "react";
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

type WeatherSnapshot = {
  fetchedAt: number;
  isDay: boolean;
  label: string;
  maxTemp: number;
  minTemp: number;
  temperature: number;
  weatherCode: number;
};

type WeatherState =
  | { status: "loading"; data: WeatherSnapshot | null }
  | { status: "ready"; data: WeatherSnapshot }
  | { status: "error"; data: WeatherSnapshot | null };

type Coords = {
  label: string;
  latitude: number;
  longitude: number;
};

const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const GEOLOCATION_TIMEOUT_MS = 5000;
const GEOLOCATION_MAX_AGE_MS = 30 * 60 * 1000;

const FALLBACK_COORDS: Coords = {
  label: "Brasilia",
  latitude: -15.793889,
  longitude: -47.882778,
};

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

function roundTemp(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : null;
}

async function fetchWeather(coords: Coords, signal?: AbortSignal): Promise<WeatherSnapshot> {
  const params = new URLSearchParams({
    latitude: String(coords.latitude),
    longitude: String(coords.longitude),
    current: "temperature_2m,weather_code,is_day",
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    forecast_days: "1",
    temperature_unit: "celsius",
    timezone: "auto",
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
    signal,
  });

  if (!response.ok) {
    throw new Error(`Weather request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const current = payload?.current;
  const daily = payload?.daily;

  return {
    fetchedAt: Date.now(),
    isDay: current?.is_day === 1,
    label: coords.label,
    maxTemp: roundTemp(daily?.temperature_2m_max?.[0]) ?? 0,
    minTemp: roundTemp(daily?.temperature_2m_min?.[0]) ?? 0,
    temperature: roundTemp(current?.temperature_2m) ?? 0,
    weatherCode: Number(current?.weather_code ?? daily?.weather_code?.[0] ?? 0),
  };
}

function resolveCoords(): Promise<Coords> {
  if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
    return Promise.resolve(FALLBACK_COORDS);
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          label: "Sua regiao",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () => resolve(FALLBACK_COORDS),
      {
        enableHighAccuracy: false,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    );
  });
}

export function TopWeather() {
  const [state, setState] = useState<WeatherState>({ status: "loading", data: null });
  const coordsRef = useRef<Coords>(FALLBACK_COORDS);

  useEffect(() => {
    let active = true;
    let intervalId: number | null = null;
    let controller: AbortController | null = null;

    const updateWeather = async (coords: Coords) => {
      controller?.abort();
      controller = new AbortController();

      try {
        const snapshot = await fetchWeather(coords, controller.signal);
        if (!active) return;
        setState({ status: "ready", data: snapshot });
      } catch (error) {
        if ((error as Error).name === "AbortError" || !active) return;
        setState((current) => ({ status: "error", data: current.data }));
      }
    };

    const init = async () => {
      const coords = await resolveCoords();
      if (!active) return;

      coordsRef.current = coords;
      await updateWeather(coords);

      if (!active) return;
      intervalId = window.setInterval(() => {
        void updateWeather(coordsRef.current);
      }, WEATHER_REFRESH_MS);
    };

    void init();

    return () => {
      active = false;
      controller?.abort();
      if (intervalId !== null) window.clearInterval(intervalId);
    };
  }, []);

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
      <span className="hidden 2xl:inline text-[9px] uppercase tracking-[0.16em] text-muted-foreground/70">
        {weather.label}
      </span>
    </span>
  );
}
