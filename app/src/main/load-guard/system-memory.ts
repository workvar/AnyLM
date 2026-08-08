import * as os from "os";

export type MemorySampleDeps = {
  totalmem: () => number;
  freemem: () => number;
};

/** Machine-wide RAM used %. Returns null on failure (callers must fail open). */
export function systemRamUsedPercent(deps?: MemorySampleDeps): number | null {
  const totalmem = deps?.totalmem ?? os.totalmem;
  const freemem = deps?.freemem ?? os.freemem;
  try {
    const total = totalmem();
    const free = freemem();
    if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(free)) return null;
    const used = Math.max(0, Math.min(total, total - free));
    return Math.round((used / total) * 100);
  } catch {
    return null;
  }
}
