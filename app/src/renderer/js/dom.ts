// Tiny DOM helpers.
//
// Everything returns UiElement (src/types/dom.d.ts): a real HTMLElement
// widened with the handful of element-specific properties this app reads, so
// `el("prompt").value` type-checks without a cast at every lookup.

/** getElementById. Returns null when the id is not in the document. */
export const el = (id: string): UiElement => document.getElementById(id) as UiElement;

/** First match for a CSS selector, scoped to `root` (default: document). */
export const qs = (selector: string, root: ParentNode = document): UiElement =>
  root.querySelector(selector) as UiElement;

/** All matches for a CSS selector, as a real array. */
export const qsa = (selector: string, root: ParentNode = document): UiElement[] =>
  Array.from(root.querySelectorAll(selector)) as UiElement[];

/** The element an event fired on, widened the same way as el(). */
export const target = (e: Event): UiElement => e.target as UiElement;

export function node(tag: string, className?: string, text?: string | null): UiElement {
  const n = document.createElement(tag) as UiElement;
  if (className) n.className = className;
  if (text != null) n.textContent = text;
  return n;
}
