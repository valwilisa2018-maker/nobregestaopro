import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Invalida queries automaticamente à meia-noite para que os KPIs do "Hoje"
 * zerem sem precisar recarregar a página. Também dispara um refresh quando a
 * aba volta a ficar visível em um dia diferente do último cálculo.
 */
export function useMidnightRefresh() {
  const qc = useQueryClient();

  useEffect(() => {
    let lastDay = new Date().toDateString();
    let timer: ReturnType<typeof setTimeout>;

    const scheduleNext = () => {
      const now = new Date();
      const next = new Date(now);
      next.setHours(24, 0, 5, 0); // 00:00:05 do próximo dia
      const ms = Math.max(1000, next.getTime() - now.getTime());
      timer = setTimeout(() => {
        lastDay = new Date().toDateString();
        qc.invalidateQueries();
        scheduleNext();
      }, ms);
    };

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      const today = new Date().toDateString();
      if (today !== lastDay) {
        lastDay = today;
        qc.invalidateQueries();
      }
    };

    scheduleNext();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [qc]);
}
