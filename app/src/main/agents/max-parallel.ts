const DEFAULT_MAX_PARALLEL = 2;

/** Integer ≥ 1; invalid/missing values fall back to `fallback` (default 2). */
export function clampMaxParallel(n: unknown, fallback = DEFAULT_MAX_PARALLEL): number {
  const num = Number(n ?? fallback);
  if (!Number.isFinite(num)) return Math.max(1, Number(fallback));
  return Math.max(1, num);
}
