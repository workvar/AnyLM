const DEFAULT_KILL = 90;
const MIN_KILL = 50;
const MAX_KILL = 99;

/** Integer kill % in 50–99; invalid/missing → fallback (default 90). */
export function clampKillPercent(n: unknown, fallback = DEFAULT_KILL): number {
  const base = Number.isFinite(Number(fallback)) ? Number(fallback) : DEFAULT_KILL;
  const num = Number(n ?? base);
  if (!Number.isFinite(num)) {
    return Math.min(MAX_KILL, Math.max(MIN_KILL, Math.round(base)));
  }
  return Math.min(MAX_KILL, Math.max(MIN_KILL, Math.round(num)));
}
