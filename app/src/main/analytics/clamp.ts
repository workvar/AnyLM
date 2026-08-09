const DEFAULT = 200;
const MIN = 50;
const MAX = 500;

export function clampTruncateChars(n: unknown, fallback = DEFAULT): number {
  const num = Number(n);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(MAX, Math.max(MIN, Math.round(num)));
}
