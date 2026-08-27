import { useEffect, useRef, useState } from "react";

export type WeatherSnapshot = {
  fetchedAt: number;
  isDay: boolean;
  label: string;
  maxTemp: number;
  minTemp: number;
  temperature: number;
  weatherCode: number;
};

export type WeatherState =
  | { status: "loading"; data: WeatherSnapshot | null }
  | { status: "ready"; data: WeatherSnapshot }
  | { status: "error"; data: WeatherSnapshot | null };

type Coords = {
  label: string;
  latitude: number;
  longitude: number;
};

const WEATHER_REFRESH_MS = 30 * 60 * 1000;
const GEOLOCATION_TIMEOUT_MS = 12000;
const GEOLOCATION_MAX_AGE_MS = 30 * 60 * 1000;

const FALLBACK_COORDS: Coords = {
  label: "Localizacao indisponivel",
  latitude: 0,
  longitude: 0,
};

async function resolveApproximateCoords(): Promise<Coords> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch("https://ipapi.co/json/", { signal: controller.signal });
    if (!response.ok) throw new Error("Approximate location unavailable");
    const payload = await response.json();
    const latitude = Number(payload?.latitude);
    const longitude = Number(payload?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error("Invalid approximate location");
    }
    return {
      label: [payload?.city, payload?.region_code].filter(Boolean).join(" - ") || "Sua regiao",
      latitude,
      longitude,
    };
  } catch {
    throw new Error("Nao foi possivel identificar a localizacao atual");
  } finally {
    window.clearTimeout(timeoutId);
  }
}

async function resolveCityName(latitude: number, longitude: number): Promise<string> {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 5000);
  try {
    const params = new URLSearchParams({
      latitude: String(latitude),
      longitude: String(longitude),
      localityLanguage: "pt",
    });
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${params.toString()}`,
      { signal: controller.signal },
    );
    if (!response.ok) throw new Error("City lookup unavailable");
    const payload = await response.json();
    const city = payload?.city || payload?.locality || payload?.principalSubdivision;
    const state = payload?.principalSubdivisionCode?.split("-")?.pop();
    return [city, state].filter(Boolean).join(" - ") || "Sua regiao";
  } catch {
    return "Sua regiao";
  } finally {
    window.clearTimeout(timeoutId);
  }
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
    return resolveApproximateCoords();
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position.coords.latitude;
        const longitude = position.coords.longitude;
        void resolveCityName(latitude, longitude).then((label) =>
          resolve({ label, latitude, longitude }),
        );
      },
      () => void resolveApproximateCoords().then(resolve),
      {
        enableHighAccuracy: true,
        maximumAge: GEOLOCATION_MAX_AGE_MS,
        timeout: GEOLOCATION_TIMEOUT_MS,
      },
    );
  });
}

// ---- Shared store: uma única busca de clima para o app inteiro ----
let sharedState: WeatherState = { status: "loading", data: null };
const listeners = new Set<(state: WeatherState) => void>();
let started = false;

function emit(state: WeatherState) {
  sharedState = state;
  listeners.forEach((listener) => listener(sharedState));
}

function startSharedWeather() {
  if (started) return;
  started = true;

  let active = true;
  let intervalId: number | null = null;
  let controller: AbortController | null = null;
  const coordsRef: { current: Coords } = { current: FALLBACK_COORDS };

  const updateWeather = async (coords: Coords) => {
    controller?.abort();
    controller = new AbortController();
    try {
      const snapshot = await fetchWeather(coords, controller.signal);
      if (!active) return;
      emit({ status: "ready", data: snapshot });
    } catch (error) {
      if ((error as Error).name === "AbortError" || !active) return;
      emit({ status: "error", data: sharedState.data });
    }
  };

  const init = async () => {
    try {
      const coords = await resolveCoords();
      if (!active) return;
      coordsRef.current = coords;
      await updateWeather(coords);
      if (!active) return;
      intervalId = window.setInterval(() => {
        void updateWeather(coordsRef.current);
      }, WEATHER_REFRESH_MS);
    } catch {
      if (active) emit({ status: "error", data: null });
    }
  };

  void init();

  // Nunca cancela: o store vive pelo tempo de vida do app.
  void intervalId;
}

export function useWeather(): WeatherState {
  const [state, setState] = useState<WeatherState>(sharedState);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    startSharedWeather();
    setState(sharedState);
    const listener = (next: WeatherState) => setState(next);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return state;
}

export type WeatherKind = "sun" | "cloudy" | "rain" | "storm" | "night" | "fog" | "snow";

export function getWeatherKind(code: number, isDay: boolean): WeatherKind {
  if (!isDay && code <= 2) return "night";
  if (code === 0) return "sun";
  if (code === 1 || code === 2) return isDay ? "sun" : "night";
  if (code === 3) return "cloudy";
  if (code === 45 || code === 48) return "fog";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return isDay ? "cloudy" : "night";
}
