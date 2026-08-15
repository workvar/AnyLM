// Turn bare URLs inside a plain-text run into real anchors.
//
// Activity rows (the Progress rail, the inline trail) show the URL a tool was
// called with. As plain text it is unverifiable: you cannot see what the model
// actually read. These anchors open in the default browser via main.ts's
// window-open handler.
import { node } from "./dom.js";

const URL_RE =
  /https?:\/\/(?:[a-z0-9](?:[-a-z0-9]*[a-z0-9])?\.)*[a-z0-9](?:[-a-z0-9]*[a-z0-9])?(?:[/?#][^\s<>"'`]*)?/gi;

/** Trailing punctuation is almost always sentence punctuation, not the URL. */
function trimTrailing(url: string): string {
  return url.replace(/[.,;:!?)\]}'"]+$/, "");
}

/** Shortened display text: host + a truncated path, so rows stay one line. */
export function displayUrl(url: string, max = 60): string {
  const bare = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return bare.length > max ? bare.slice(0, max - 1) + "…" : bare;
}

/**
 * Append `text` to `parent`, with any http(s) URLs as clickable anchors.
 * Returns the number of links added (0 = it was plain text).
 */
export function appendLinkified(parent: HTMLElement, text: string): number {
  const s = String(text ?? "");
  if (!s) return 0;
  URL_RE.lastIndex = 0;
  let last = 0;
  let count = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_RE.exec(s))) {
    const raw = trimTrailing(m[0]);
    if (!raw) continue;
    if (m.index > last) parent.appendChild(document.createTextNode(s.slice(last, m.index)));
    const a = node("a", "act-link", displayUrl(raw)) as unknown as HTMLAnchorElement;
    a.href = raw;
    a.title = raw;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    parent.appendChild(a);
    count += 1;
    last = m.index + raw.length;
  }
  if (!count) return 0;
  if (last < s.length) parent.appendChild(document.createTextNode(s.slice(last)));
  return count;
}

/** A detail element whose URLs are clickable. */
export function detailNode(className: string, text: string): HTMLElement {
  const wrap = node("div", className);
  if (!appendLinkified(wrap, text)) wrap.textContent = text;
  return wrap;
}
