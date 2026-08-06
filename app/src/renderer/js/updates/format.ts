// Human-readable sizes, transfer rates, and time remaining for the update toast.

const UNITS = ["B", "KB", "MB", "GB"];

export function bytes(n) {
  if (!n || n < 0) return "0 B";
  let i = 0;
  let v = n;
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v >= 10 || i === 0 ? Math.round(v) : v.toFixed(1)} ${UNITS[i]}`;
}

export function speed(bytesPerSecond) {
  return bytesPerSecond > 0 ? `${bytes(bytesPerSecond)}/s` : "…";
}

export function eta(seconds) {
  if (seconds == null || !isFinite(seconds)) return "";
  if (seconds < 5) return "almost done";
  if (seconds < 60) return `${seconds}s left`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m} min left`;
  return `${Math.round(m / 60)} hr left`;
}

// "12.4 MB of 88 MB · 3.1 MB/s · 24s left"
export function progressLine({ transferred, total, bytesPerSecond, etaSeconds }) {
  const parts = [];
  if (total > 0) parts.push(`${bytes(transferred)} of ${bytes(total)}`);
  parts.push(speed(bytesPerSecond));
  const left = eta(etaSeconds);
  if (left) parts.push(left);
  return parts.join(" · ");
}
