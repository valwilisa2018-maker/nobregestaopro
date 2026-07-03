import { useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import caixaAsset from "@/assets/caixa-registradora.m4a.asset.json";

export type GoalItem = {
  key: string;         // stable id: "daily" | "weekly" | "monthly" | ...
  current: number;
  goal: number;
  label: string;       // "Meta diária", "Meta semanal", ...
  periodStamp: string; // e.g. "2026-07-03" for daily, week-start for weekly, month for monthly
};

function storageKey(item: GoalItem) {
  return `goal-reached:${item.key}:${item.periodStamp}`;
}

function fireFireworks(duration = 4000) {
  const end = Date.now() + duration;
  const colors = ["#f0d78c", "#c9a84c", "#ffffff", "#fff7d6", "#22c55e", "#3b82f6", "#ef4444"];
  (function frame() {
    confetti({ particleCount: 6, angle: 60, spread: 90, startVelocity: 60, origin: { x: 0, y: 0.9 }, colors });
    confetti({ particleCount: 6, angle: 120, spread: 90, startVelocity: 60, origin: { x: 1, y: 0.9 }, colors });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
  const bursts = [0, 400, 900, 1500, 2200, 3000];
  bursts.forEach((delay) => {
    setTimeout(() => {
      confetti({
        particleCount: 140,
        spread: 360,
        startVelocity: 35,
        ticks: 90,
        origin: { x: 0.2 + Math.random() * 0.6, y: 0.2 + Math.random() * 0.3 },
        colors,
        scalar: 1.2,
      });
    }, delay);
  });
}

function playCelebrationSound() {
  try {
    const audio = new Audio(caixaAsset.url);
    audio.volume = 0.9;
    void audio.play().catch(() => {});
  } catch {}
}

export function GoalCelebration({ items }: { items: GoalItem[] }) {
  const firedRef = useRef<Set<string>>(new Set());
  const [banner, setBanner] = useState<{ label: string; id: number } | null>(null);

  useEffect(() => {
    for (const item of items) {
      if (!item.goal || item.goal <= 0) continue;
      if (item.current < item.goal) continue;
      const sk = storageKey(item);
      if (firedRef.current.has(sk)) continue;
      firedRef.current.add(sk);
      try {
        if (typeof window !== "undefined" && window.localStorage.getItem(sk)) continue;
        window.localStorage.setItem(sk, "1");
      } catch {}
      fireFireworks();
      playCelebrationSound();
      const id = Date.now();
      setBanner({ label: item.label, id });
      window.setTimeout(() => {
        setBanner((b) => (b && b.id === id ? null : b));
      }, 6000);
    }
  }, [items]);

  if (!banner) return null;
  return (
    <div className="fixed inset-x-0 top-6 z-[9999] flex justify-center pointer-events-none px-4">
      <div className="pointer-events-auto rounded-2xl border-2 border-amber-400 bg-gradient-to-br from-amber-500 via-yellow-500 to-amber-600 px-8 py-5 shadow-2xl animate-in fade-in zoom-in-95 slide-in-from-top-4">
        <div className="flex items-center gap-4">
          <span className="text-4xl">🎉</span>
          <div className="text-center">
            <div className="text-white text-2xl md:text-3xl font-black tracking-tight drop-shadow">
              Parabéns! Meta atingida
            </div>
            <div className="text-amber-50 text-sm md:text-base font-semibold uppercase tracking-wider">
              {banner.label}
            </div>
          </div>
          <span className="text-4xl">🏆</span>
        </div>
      </div>
    </div>
  );
}