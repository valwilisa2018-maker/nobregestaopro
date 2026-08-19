import { useCallback, useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "theme-v2";
const EVENT = "platform-theme-changed";

function apply(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("light", theme === "light");
  root.classList.toggle("dark", theme === "dark");
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === "undefined") return "dark";
    return (localStorage.getItem(KEY) as Theme) || "light";
  });

  useEffect(() => {
    apply(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  useEffect(() => {
    const sync = (event: Event) => {
      const next = (event as CustomEvent<Theme>).detail;
      if (next === "light" || next === "dark") setTheme(next);
    };
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const changeTheme = useCallback((next: Theme) => {
    setTheme(next);
    apply(next);
    localStorage.setItem(KEY, next);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  }, []);

  return {
    theme,
    toggle: () => changeTheme(theme === "dark" ? "light" : "dark"),
    setTheme: changeTheme,
  };
}
