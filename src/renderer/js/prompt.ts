// Small async text-input dialog (Electron blocks window.prompt).
import { el } from "./dom.js";

let resolver: ((value: string | null) => void) | null = null;

function done(value: string | null) {
  el("prompt-modal").classList.add("hidden");
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

export function promptText(title: string, value = ""): Promise<string | null> {
  el("prompt-title").textContent = title;
  el("prompt-input").value = value;
  el("prompt-modal").classList.remove("hidden");
  const input = el("prompt-input");
  input.focus();
  input.select();
  return new Promise<string | null>((res) => {
    resolver = res;
  });
}

export function initPrompt() {
  el("prompt-ok").onclick = () => done(el("prompt-input").value.trim() || null);
  el("prompt-cancel").onclick = () => done(null);
  el("prompt-modal").onclick = (e) => {
    if ((e.target as UiElement).id === "prompt-modal") done(null);
  };
  el("prompt-input").onkeydown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      done(el("prompt-input").value.trim() || null);
    } else if (e.key === "Escape") {
      done(null);
    }
  };
}
