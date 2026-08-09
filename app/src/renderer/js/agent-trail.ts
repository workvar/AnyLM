// Collapsed-by-default summary of a multi-agent orchestrated turn, layered
// on top of the single-agent trail in activity-trail.ts (not a second trail
// system): summarizeAgentTrail turns agent:plan/agent:step/agent:merge
// events into a title + lines, and paintAgentTrail feeds that into a
// <details class="agent-trail"> appended alongside the existing trail host.
import { stepKindLabel } from "./agent-labels.js";
import { node } from "./dom.js";

export type AgentTrailSummary = { title: string; lines: string[] };

type AgentPlanEvent = Extract<ActivityEvent, { kind: "agent:plan" }>;
type AgentStepEvent = Extract<ActivityEvent, { kind: "agent:step" }>;

function stepGlyph(status: AgentStepEvent["status"] | undefined): string {
  if (status === "done") return "✓";
  if (status === "error") return "✗";
  if (status === "running") return "●";
  return "•";
}

export function summarizeAgentTrail(events: ActivityEvent[]): AgentTrailSummary | null {
  const plan = events.find((e): e is AgentPlanEvent => e.kind === "agent:plan");
  if (!plan) return null;

  const latestById = new Map<string, AgentStepEvent>();
  for (const ev of events) {
    if (ev.kind === "agent:step") latestById.set(ev.id, ev);
  }

  const lines = plan.steps.map((s) => {
    const step = latestById.get(s.id);
    const glyph = stepGlyph(step?.status);
    const detail = step?.detail ? ` — ${step.detail}` : "";
    return `${glyph} ${s.goal} (${stepKindLabel(s.stepKind)})${detail}`;
  });

  if (events.some((e) => e.kind === "agent:merge")) {
    lines.push("Combining results…");
  }

  const count = plan.steps.length;
  return {
    title: `Planned ${count} step${count === 1 ? "" : "s"}`,
    lines,
  };
}

/** Render (or clear) the collapsed agent-trail summary into `host`. Safe to call on every repaint. */
export function paintAgentTrail(host: HTMLElement, events: ActivityEvent[]): void {
  host.querySelector(".agent-trail")?.remove();
  const summary = summarizeAgentTrail(events);
  if (!summary) return;

  const details = document.createElement("details") as HTMLDetailsElement;
  details.className = "agent-trail";
  details.appendChild(node("summary", "agent-trail-summary", summary.title));
  const lines = node("div", "agent-trail-lines");
  for (const line of summary.lines) {
    lines.appendChild(node("div", "agent-trail-line", line));
  }
  details.appendChild(lines);
  host.appendChild(details);
}
