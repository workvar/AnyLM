/** "42s", "1m 28s", "1h 02m" — the live clock on a running turn. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  if (mins < 60) return `${mins}m ${String(secs).padStart(2, "0")}s`;
  return `${Math.floor(mins / 60)}h ${String(mins % 60).padStart(2, "0")}m`;
}

/** Summary under a finished turn: "Used 9 tools · thought for 12s". */
export function workSummary(toolCount: number, thoughtLabel: string): string {
  if (!toolCount) return thoughtLabel;
  const tools = `Used ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
  return `${tools} · ${thoughtLabel.toLowerCase()}`;
}
