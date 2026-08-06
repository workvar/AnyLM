// Inline activity trail above the assistant bubble (live + collapsed history).
import { node } from "./dom.js";
import { formatThought } from "./activity-store.js";

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

export function paintTrail(
  host: HTMLElement,
  events: ActivityEvent[],
  opts: PaintTrailOpts
): void {
  host.innerHTML = "";
  const trail = node("div", "activity-trail");
  host.appendChild(trail);

  for (const ev of events) {
    if (ev.kind === "thinking") {
      const ms = ev.phase === "start" ? opts.thoughtTickMs ?? 0 : ev.ms ?? 0;
      trail.appendChild(node("div", "act-row act-thinking", formatThought(ms)));
      continue;
    }
    if (ev.kind === "status") {
      trail.appendChild(node("div", "act-row act-status", ev.text));
      continue;
    }
    if (ev.kind === "tool") {
      const row = node("div", "act-row act-tool");
      const toggle = node("button", "act-tool-toggle", ev.label);
      toggle.type = "button";
      row.appendChild(toggle);
      if (ev.detail) row.appendChild(node("div", "act-tool-detail", ev.detail));
      if (ev.output) {
        const out = node("pre", "act-tool-out hidden", ev.output);
        if (ev.status === "done") {
          toggle.onclick = () => out.classList.toggle("hidden");
        }
        row.appendChild(out);
      }
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "confirm") {
      // generate_document uses the file-card permission UI — skip duplicate Allow/Deny.
      if (ev.tool?.name === "generate_document") continue;
      const row = node("div", "act-row act-confirm");
      row.appendChild(node("span", "act-confirm-prompt", `Allow ${ev.label}?`));
      const showActions =
        opts.live &&
        !!opts.pendingConfirmToken &&
        opts.pendingConfirmToken === ev.token;
      if (showActions) {
        const allow = node("button", "act-allow", "Allow");
        allow.type = "button";
        allow.onclick = () => opts.onAllow?.(ev.token);
        const deny = node("button", "act-deny", "Deny");
        deny.type = "button";
        deny.onclick = () => opts.onDeny?.(ev.token);
        row.appendChild(allow);
        row.appendChild(deny);
      }
      trail.appendChild(row);
      continue;
    }
    if (ev.kind === "ask") {
      trail.appendChild(node("div", "act-row act-ask", ev.question));
    }
  }
}

/** Collapsed summary; click toggles full read-only trail. */
export function paintCollapsed(host: HTMLElement, activity: MessageActivity): void {
  host.innerHTML = "";
  const btn = node("button", "activity-summary", activity.summary);
  btn.type = "button";
  btn.onclick = () => {
    paintTrail(host, activity.events, { live: false });
    const collapse = node("button", "activity-summary", activity.summary);
    collapse.type = "button";
    collapse.onclick = () => paintCollapsed(host, activity);
    host.insertBefore(collapse, host.firstChild);
  };
  host.appendChild(btn);
}
