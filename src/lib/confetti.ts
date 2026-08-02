// Lazy wrapper around canvas-confetti so the ~12kb library is only downloaded
// the first time a celebration actually fires (keeps the initial bundle light).
type ConfettiFn = (opts?: Record<string, unknown>) => void;

let loaded: ConfettiFn | null = null;
let loading: Promise<ConfettiFn | null> | null = null;

function load(): Promise<ConfettiFn | null> {
  if (loaded) return Promise.resolve(loaded);
  loading ??= import("canvas-confetti")
    .then((m) => {
      loaded = m.default as unknown as ConfettiFn;
      return loaded;
    })
    .catch(() => null);
  return loading;
}

/** Fire-and-forget confetti. Loads the library on first call, then runs sync. */
export function confetti(opts?: Record<string, unknown>): void {
  if (loaded) {
    loaded(opts);
    return;
  }
  void load().then((fn) => fn?.(opts));
}

/** Warm the chunk ahead of a celebration so the first burst is instant. */
export function preloadConfetti(): void {
  void load();
}

export default confetti;
