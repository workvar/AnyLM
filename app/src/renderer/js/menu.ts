// Lightweight popup menu used by right-click, the card "⋯" buttons, and the
// project pickers. Items are real buttons, so the menu is keyboard-operable:
// arrows move, Enter activates, Escape closes and hands focus back.
import { node } from "./dom.js";

let current: HTMLElement | null = null;
let returnFocus: HTMLElement | null = null;

// Long enough for the .closing transition in styles.css, short enough that a
// menu never lingers if transitionend does not fire (reduced motion, a
// backgrounded window, a transition interrupted by a second close).
const EXIT_MS = 140;

/** Detach a menu once its exit transition has played, at most once. */
function removeAfterExit(menu: HTMLElement) {
  let done = false;
  const drop = () => {
    if (done) return;
    done = true;
    menu.remove();
  };
  menu.addEventListener("transitionend", drop, { once: true });
  setTimeout(drop, EXIT_MS);
}

export function closeMenu() {
  if (!current) return;
  const menu = current;
  // Dropped from `current` first: it is on its way out, so keyboard
  // navigation and the next showMenu() must not see it any more.
  current = null;
  menu.classList.remove("open");
  menu.classList.add("closing");
  removeAfterExit(menu);
  const back = returnFocus;
  returnFocus = null;
  back?.setAttribute?.("aria-expanded", "false");
  back?.focus?.();
}

document.addEventListener("click", closeMenu);
document.addEventListener("scroll", closeMenu, true);
window.addEventListener("resize", closeMenu);

export interface MenuItem {
  label: string;
  danger?: boolean;
  checked?: boolean;
  onClick: () => void | Promise<void>;
}

export interface MenuSeparator {
  separator: true;
}

export type MenuEntry = MenuItem | MenuSeparator;

export interface MenuOptions {
  /** Accessible name for the menu itself. */
  ariaLabel?: string;
  /** Control the menu was opened from; focus returns here on close. */
  anchor?: HTMLElement | null;
  /** "above" treats (x, y) as the menu's bottom-left instead of its top-left. */
  place?: "below" | "above";
}

const isSeparator = (e: MenuEntry): e is MenuSeparator => "separator" in e;

function items(): HTMLElement[] {
  if (!current) return [];
  return Array.from(current.querySelectorAll<HTMLElement>(".popup-item"));
}

function focusAt(index: number) {
  const list = items();
  if (!list.length) return;
  const i = (index + list.length) % list.length;
  list[i].focus();
}

function move(delta: number) {
  const list = items();
  const at = list.indexOf(document.activeElement as HTMLElement);
  focusAt(at < 0 ? (delta > 0 ? 0 : -1) : at + delta);
}

document.addEventListener("keydown", (e) => {
  if (!current) return;
  if (e.key === "Escape") (e.preventDefault(), closeMenu());
  else if (e.key === "ArrowDown") (e.preventDefault(), move(1));
  else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
  else if (e.key === "Home") (e.preventDefault(), focusAt(0));
  else if (e.key === "End") (e.preventDefault(), focusAt(-1));
});

export function showMenu(x: number, y: number, entries: MenuEntry[], opts: MenuOptions = {}) {
  closeMenu();
  const checkable = entries.some((it) => !isSeparator(it) && it.checked !== undefined);
  const menu = node("div", "popup-menu");
  menu.setAttribute("role", "menu");
  if (opts.ariaLabel) menu.setAttribute("aria-label", opts.ariaLabel);
  menu.onclick = (e) => e.stopPropagation();

  for (const it of entries) {
    if (isSeparator(it)) {
      const sep = node("div", "popup-sep");
      sep.setAttribute("role", "separator");
      menu.appendChild(sep);
      continue;
    }
    const b = node("button", "popup-item" + (it.danger ? " danger" : "") + (it.checked ? " checked" : ""));
    b.setAttribute("type", "button");
    b.setAttribute("role", checkable ? "menuitemradio" : "menuitem");
    if (checkable) {
      b.setAttribute("aria-checked", String(!!it.checked));
      b.appendChild(node("span", "popup-check", it.checked ? "✓" : ""));
    }
    b.appendChild(node("span", "popup-label", it.label));
    b.onclick = (e) => {
      e.stopPropagation();
      returnFocus = null; // the action moves focus itself
      closeMenu();
      it.onClick();
    };
    menu.appendChild(b);
  }

  // data-place drives the transform-origin, so the menu grows out of its
  // trigger rather than out of thin air.
  menu.dataset.place = opts.place === "above" ? "above" : "below";
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  const top = opts.place === "above" ? y - r.height : y;
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(top, window.innerHeight - r.height - 8)) + "px";
  // Two frames: the first commits the start state at the final position, the
  // second flips to .open so the transition actually has something to run.
  requestAnimationFrame(() => requestAnimationFrame(() => menu.classList.add("open")));
  current = menu;
  returnFocus = opts.anchor || null;
  opts.anchor?.setAttribute("aria-expanded", "true");
  focusAt(Math.max(0, entries.findIndex((it) => !isSeparator(it) && it.checked)));
}
