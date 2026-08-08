export function formatThought(ms: number): string {
  if (ms < 1500) return "Thought briefly";
  return `Thought for ${Math.round(ms / 1000)}s`;
}

export function buildSummary(thoughtMs: number, toolCount: number): string {
  const thought = formatThought(thoughtMs);
  if (!toolCount) return thought;
  return `${thought} · ${toolCount} tool${toolCount === 1 ? "" : "s"}`;
}

export function toolCountOf(events: ActivityEvent[]): number {
  return events.filter((e) => e.kind === "tool" && e.status === "done").length;
}

export function thoughtMsOf(events: ActivityEvent[]): number {
  return events
    .filter((e): e is Extract<ActivityEvent, { kind: "thinking" }> =>
      e.kind === "thinking" && e.phase === "end"
    )
    .reduce((n, e) => n + (e.ms || 0), 0);
}

export function applyActivity(events: ActivityEvent[], ev: ActivityEvent): ActivityEvent[] {
  if (ev.kind === "thinking" && ev.phase === "end") {
    const next = events.slice();
    for (let i = next.length - 1; i >= 0; i--) {
      const cur = next[i];
      if (cur.kind === "thinking" && cur.phase === "start") {
        next[i] = ev;
        return next;
      }
    }
    return [...next, ev];
  }
  if (ev.kind === "tool" && ev.status === "done") {
    const next = events.slice();
    for (let i = next.length - 1; i >= 0; i--) {
      const cur = next[i];
      if (cur.kind === "tool" && cur.status === "running" && cur.name === ev.name) {
        next[i] = { ...cur, ...ev, status: "done" };
        return next;
      }
    }
    return [...next, ev];
  }
  if (ev.kind === "status") {
    return [...events.filter((event) => event.kind !== "status"), ev];
  }
  if (ev.kind === "done") {
    // Keep prior events for the trail; done is metadata for consumers — do not append.
    return events;
  }
  return [...events, ev];
}
