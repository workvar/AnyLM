// Keep the message log pinned to the newest content while a reply streams.
//
// Individual render paths used to each call `scrollTop = scrollHeight` at the
// moment they appended. That misses every later height change — markdown
// swapped in for raw text when a turn finishes, images and file cards
// resolving, activity rows expanding — so the view stalls mid-reply. A single
// observer on the log handles all of them.
import { el } from "./dom.js";

// Treat "within this many px of the bottom" as following along.
const STICK_PX = 120;

let observer: MutationObserver | null = null;
let following = true;
let raf = 0;

function log(): HTMLElement | null {
  return document.getElementById("messages");
}

function atBottom(m: HTMLElement): boolean {
  return m.scrollHeight - m.scrollTop - m.clientHeight <= STICK_PX;
}

function pin(m: HTMLElement) {
  raf = 0;
  m.scrollTop = m.scrollHeight;
}

function schedulePin() {
  const m = log();
  if (!m || !following || raf) return;
  raf = requestAnimationFrame(() => pin(m));
}

/** Jump to the newest message. `force` re-enables following after the user scrolled up. */
export function scrollToBottom(force = false): void {
  const m = log();
  if (!m) return;
  if (force) following = true;
  if (!following) return;
  m.scrollTop = m.scrollHeight;
}

/** True while the view is tracking new content. */
export function isFollowing(): boolean {
  return following;
}

export function initAutoScroll(): void {
  const m = log();
  if (!m || observer) return;

  // Scrolling up stops the follow; scrolling back to the bottom resumes it.
  // Without this, auto-scroll would fight a user reading earlier messages.
  m.addEventListener(
    "scroll",
    () => {
      if (raf) return; // our own programmatic scroll
      following = atBottom(m);
    },
    { passive: true }
  );

  observer = new MutationObserver(schedulePin);
  observer.observe(m, { childList: true, subtree: true, characterData: true });

  if (typeof ResizeObserver !== "undefined") {
    // Catches height changes that mutate no nodes (images, iframes, fonts).
    const ro = new ResizeObserver(schedulePin);
    ro.observe(m);
  }
}
