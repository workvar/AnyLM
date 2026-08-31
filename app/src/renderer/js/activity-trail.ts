// Inline activity trail above the assistant bubble (live + collapsed history).
import { node } from "./dom.js";
import { formatThought } from "./activity-store.js";
import { paintAgentTrail } from "./agent-trail.js";
import { appendLinkified, detailNode } from "./linkify.js";
import { iconFor, kindOf } from "./activity-icons.js";
import { formatElapsed } from "./elapsed.js";

export function createTrailHost(): HTMLElement {
  return node("div", "activity-trail-host");
}

export type PaintTrailOpts = {
  live: boolean;
  thoughtTickMs?: number;
  /** When set, only this confirm token shows Allow/Deny (answered confirms stay text-only). */
  pendingConfirmToken?: string | null;
  /** Milliseconds since the turn started, for the live "Working…" row. */
  elapsedMs?: number;
  /** Label for the live row, e.g. "Working on your computer". */
  liveLabel?: string;
  onAllow?: (token: string, scope: ConfirmScope) => void;
  onDeny?: (token: string) => void;
};

export type ConfirmScope = "once" | "session" | "project";

function bullet(done: boolean, running: boolean): HTMLElement {
  const b = node("span", `act-bullet${done ? " done" : ""}${running ? " run" : ""}`);
  b.textContent = done ? "✓" : running ? "●" : "•";
  return b;
}


const SCOPE_BUTTONS: { scope: ConfirmScope; label: string; title: string }[] = [
  { scope: "once", label: "Allow", title: "Run this one time" },
  { scope: "session", label: "This session", title: "Stop asking for this tool until AnyLM quits" },
  { scope: "project", label: "Always here", title: "Stop asking for this tool in this project" },
];

/** Allow / This session / Always here / Deny. */
function confirmActions(token: string, opts: PaintTrailOpts): HTMLElement {
  const actions = node("div", "act-confirm-actions");
  for (const { scope, label, title } of SCOPE_BUTTONS) {
    const btn = node("button", scope === "once" ? "act-allow" : "act-allow act-allow-scope", label);
    btn.type = "button";
    btn.title = title;
    btn.onclick = () => opts.onAllow?.(token, scope);
    actions.appendChild(btn);
  }
  const deny = node("button", "act-deny", "Deny");
  deny.type = "button";
  deny.onclick = () => opts.onDeny?.(token);
  actions.appendChild(deny);
  return actions;
}

export function paintTrail(
  host: HTMLElement,
  events: ActivityEvent[],
  opts: PaintTrailOpts
): void {
  host.innerHTML = "";
  const trail = node("div", "activity-trail");
  host.appendChild(trail);

  const lastStatusIdx = (() => {
    for (let i = events.length - 1; i >= 0; i--) {
      if (events[i].kind === "status") return i;
    }
    return -1;
  })();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    if (ev.kind === "thinking") {
      const live = opts.live && ev.phase === "start";
      const ms = live ? opts.thoughtTickMs ?? 0 : ev.ms ?? 0;
      const row = node("div", `act-row act-thinking${live ? " live" : ""}`);
      row.appendChild(bullet(false, live));
      const label = node("span", "act-text", formatThought(ms));
      row.appendChild(label);
      if (live) row.appendChild(node("span", "act-live-tag", "thinking"));
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "status") {
      const running = opts.live && i === lastStatusIdx;
      const row = node("div", "act-row act-status");
      row.appendChild(bullet(false, running));
      row.appendChild(node("span", "act-text", ev.text));
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "tool") {
      const running = ev.status === "running";
      const done = ev.status === "done";
      const row = node("div", `act-row act-tool${running ? " live" : ""}`);
      // The icon carries the family (read / write / shell / network); the
      // bullet only ever said "step", which the label already said better.
      const mark = iconFor(kindOf(ev.name));
      mark.classList.add(done ? "done" : running ? "run" : "idle");
      row.appendChild(mark);
      const body = node("div", "act-tool-body");
      const head = node("div", "act-tool-head");
      const toggle = node("button", "act-tool-toggle", ev.label);
      toggle.type = "button";
      head.appendChild(toggle);
      if (running) head.appendChild(node("span", "act-live-tag", "running"));
      body.appendChild(head);
      if (ev.detail) body.appendChild(detailNode("act-tool-detail", ev.detail));
      if (ev.output) {
        // Linkified so the URLs a search returned are clickable, not just text.
        const out = node("pre", "act-tool-out hidden");
        if (!appendLinkified(out, ev.output)) out.textContent = ev.output;
        if (done) {
          toggle.title = "Show tool output";
          toggle.onclick = () => out.classList.toggle("hidden");
        }
        body.appendChild(out);
      }
      row.appendChild(body);
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "confirm") {
      // generate_document uses the file-card permission UI — skip duplicate Allow/Deny.
      if (ev.tool?.name === "generate_document") continue;
      const row = node("div", "act-row act-confirm");
      row.appendChild(bullet(false, true));
      row.appendChild(node("span", "act-confirm-prompt", `Allow ${ev.label}?`));
      const showActions =
        opts.live &&
        !!opts.pendingConfirmToken &&
        opts.pendingConfirmToken === ev.token;
      if (showActions) {
        row.appendChild(confirmActions(ev.token, opts));
      }
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "ask") {
      const row = node("div", "act-row act-ask");
      row.appendChild(bullet(false, opts.live));
      row.appendChild(node("span", "act-text", ev.question));
      trail.appendChild(row);
    }
  }

  // Live clock: one row that says work is still happening and for how long,
  // so a long tool run never looks like a stall. Skip it when the trail's
  // last event is itself a live "thinking" row (rendered above, in the loop)
  // -- that row already shows the same "Thought for Ns" text plus a
  // THINKING tag, so appending this footer duplicated it verbatim.
  const lastEvent = events[events.length - 1];
  const trailingIsLiveThought =
    !!lastEvent && lastEvent.kind === "thinking" && lastEvent.phase === "start";
  if (opts.live && !trailingIsLiveThought) {
    const row = node("div", "act-row act-working");
    row.appendChild(node("span", "act-spinner"));
    row.appendChild(node("span", "act-text", opts.liveLabel || "Working"));
    row.appendChild(node("span", "act-elapsed", formatElapsed(opts.elapsedMs ?? 0)));
    trail.appendChild(row);
  }

  // host.innerHTML = "" above wipes out any `.agent-trail` node a previous
  // paintAgentTrail() call appended to this same host — re-add it so
  // expanding/collapsing the plain trail doesn't permanently delete the
  // agent-trail summary alongside it.
  paintAgentTrail(host, events);
}

/** Collapsed summary; click toggles full read-only trail. */
export function paintCollapsed(host: HTMLElement, activity: MessageActivity): void {
  host.innerHTML = "";
  const btn = node("button", "activity-summary", activity.summary);
  btn.type = "button";
  btn.title = "Show what the model did";
  btn.onclick = () => {
    paintTrail(host, activity.events, { live: false });
    const collapse = node("button", "activity-summary is-expanded", "Hide steps");
    collapse.type = "button";
    collapse.onclick = () => paintCollapsed(host, activity);
    host.insertBefore(collapse, host.firstChild);
  };
  host.appendChild(btn);
  // Same reasoning as in paintTrail: host.innerHTML = "" above would
  // otherwise permanently drop the agent-trail summary the first time this
  // (or the "Hide steps" handler above, which re-enters here) runs.
  paintAgentTrail(host, activity.events);
}
