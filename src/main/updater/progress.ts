// Smooths electron-updater's raw download-progress events.
// Its bytesPerSecond is instantaneous and jumps around a lot, so we run an
// exponential moving average and derive a stable ETA from that.

const ALPHA = 0.25; // weight of the newest sample; lower = smoother

function createTracker() {
  let speed = 0;
  let startedAt = 0;

  return {
    reset() {
      speed = 0;
      startedAt = Date.now();
    },

    // Turn a raw progress event into the shape the renderer draws.
    sample(p) {
      const total = p.total || 0;
      const transferred = p.transferred || 0;
      const raw = p.bytesPerSecond || 0;

      // Fall back to an average over the whole download if the event has no rate.
      const elapsed = (Date.now() - startedAt) / 1000;
      const measured = raw > 0 ? raw : elapsed > 0 ? transferred / elapsed : 0;
      speed = speed === 0 ? measured : speed + ALPHA * (measured - speed);

      const remaining = Math.max(0, total - transferred);
      const etaSeconds = speed > 0 ? Math.round(remaining / speed) : null;

      return {
        percent: total > 0 ? Math.min(100, (transferred / total) * 100) : p.percent || 0,
        transferred,
        total,
        bytesPerSecond: Math.max(0, Math.round(speed)),
        etaSeconds,
      };
    },
  };
}

export { createTracker };

