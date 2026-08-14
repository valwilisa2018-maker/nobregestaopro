export const VIDEO_POINT_SECONDS = 30;

export function parseDuracaoSegundos(name: string): number {
  if (!name) return 0;

  const s = String(name).toLowerCase();
  const mColon = s.match(/(?<![\d:])(\d{1,2})(?::(\d{1,2}))(?::(\d{1,2}))?(?![\d:])/);
  if (mColon) {
    const a = Number(mColon[1] || 0);
    const b = Number(mColon[2] || 0);
    const c = mColon[3] != null ? Number(mColon[3]) : null;
    if (c != null) return a * 3600 + b * 60 + c;
    return a * 60 + b;
  }

  const mUnits = s.match(/(\d+)\s*(?:min|m)(?:\s*(\d+)\s*s\b)?/);
  if (mUnits) return Number(mUnits[1]) * 60 + Number(mUnits[2] || 0);

  const mSec = s.match(/(\d+)\s*s\b/);
  if (mSec) return Number(mSec[1]);

  return 0;
}

export function calculateVideoPoints(totalSegundos: number | null | undefined): number {
  const segundos = Number(totalSegundos ?? 0);
  if (!Number.isFinite(segundos) || segundos <= 0) return 0;
  return segundos / VIDEO_POINT_SECONDS;
}
