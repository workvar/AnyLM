// Lightweight popup menu used by right-click and the card "⋯" buttons.
import { node } from "./dom.js";

let current: HTMLElement | null = null;

export function closeMenu() {
  if (current) {
    current.remove();
    current = null;
  }
}

document.addEventListener("click", closeMenu);
document.addEventListener("scroll", closeMenu, true);
window.addEventListener("resize", closeMenu);

export interface MenuItem {
  label: string;
  danger?: boolean;
  onClick: () => void | Promise<void>;
}

export function showMenu(x: number, y: number, items: MenuItem[]) {
  closeMenu();
  const menu = node("div", "popup-menu");
  for (const it of items) {
    const b = node("button", "popup-item" + (it.danger ? " danger" : ""), it.label);
    b.onclick = (e) => {
      e.stopPropagation();
      closeMenu();
      it.onClick();
    };
    menu.appendChild(b);
  }
  document.body.appendChild(menu);
  const r = menu.getBoundingClientRect();
  menu.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + "px";
  menu.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + "px";
  current = menu;
}
