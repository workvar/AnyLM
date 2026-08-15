// Inline activity trail above the assistant bubble (live + collapsed history).
import { node } from "./dom.js";
import { formatThought } from "./activity-store.js";
import { paintAgentTrail } from "./agent-trail.js";
import { appendLinkified, detailNode } from "./linkify.js";

export function createTrailHost(): HTMLElement {
  return node("div", "activity-trail-host");
}

export type PaintTrailOpts = {
  live: boolean;
  thoughtTickMs?: number;
  /** When set, only this confirm token shows Allow/Deny (answered confirms stay text-only). */
  pendingConfirmToken?: string | null;
  onAllow?: (token: string) => void;
  onDeny?: (token: string) => void;
};

function bullet(done: boolean, running: boolean): HTMLElement {
  const b = node("span", `act-bullet${done ? " done" : ""}${running ? " run" : ""}`);
  b.textContent = done ? "✓" : running ? "●" : "•";
  return b;
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
      row.appendChild(bullet(done, running));
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
        const actions = node("div", "act-confirm-actions");
        const allow = node("button", "act-allow", "Allow");
        allow.type = "button";
        allow.onclick = () => opts.onAllow?.(ev.token);
        const deny = node("button", "act-deny", "Deny");
        deny.type = "button";
        deny.onclick = () => opts.onDeny?.(ev.token);
        actions.append(allow, deny);
        row.appendChild(actions);
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
