export function isOverKillLimit(usedPercent: number | null, killPercent: number): boolean {
  if (usedPercent == null || !Number.isFinite(usedPercent)) return false;
  return usedPercent >= killPercent;
}

export function effectiveMaxParallel(
  configured: number,
  opts: { enabled: boolean; overKill: boolean }
): number {
  if (!opts.enabled || !opts.overKill) return configured;
  return 1;
}

export type SustainedPressure = { prevOver: boolean };

export function nextSustainedPressure(
  state: SustainedPressure,
  sample: number | null,
  killPercent: number
): { state: SustainedPressure; trip: boolean; over: boolean } {
  if (sample == null) {
    return { state: { prevOver: false }, trip: false, over: false };
  }
  const over = isOverKillLimit(sample, killPercent);
  const trip = state.prevOver && over;
  return { state: { prevOver: over }, trip, over };
}

export type InFlightMonitorOpts = {
  enabled: boolean;
  killPercent: number;
  sample: () => number | null;
  onTrip: () => void;
  intervalMs?: number;
  setIntervalFn?: typeof setInterval;
  clearIntervalFn?: typeof clearInterval;
};

export function createInFlightMonitor(opts: InFlightMonitorOpts): {
  start(): void;
  stop(): void;
} {
  const intervalMs = opts.intervalMs ?? 2000;
  const setIntervalFn = opts.setIntervalFn ?? setInterval;
  const clearIntervalFn = opts.clearIntervalFn ?? clearInterval;
  let handle: ReturnType<typeof setInterval> | null = null;
  let pressure: SustainedPressure = { prevOver: false };
  let tripped = false;

  return {
    start() {
      if (!opts.enabled || handle) return;
      handle = setIntervalFn(() => {
        if (tripped) return;
        const next = nextSustainedPressure(pressure, opts.sample(), opts.killPercent);
        pressure = next.state;
        if (next.trip) {
          tripped = true;
          opts.onTrip();
        }
      }, intervalMs);
    },
    stop() {
      if (handle != null) {
        clearIntervalFn(handle);
        handle = null;
      }
    },
  };
}
