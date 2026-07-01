// Small async text-input dialog (Electron blocks window.prompt).
import { el } from "./dom.js";

let resolver = null;

function done(value) {
  el("prompt-modal").classList.add("hidden");
  const r = resolver;
  resolver = null;
  if (r) r(value);
}

export function promptText(title, value = "") {
  el("prompt-title").textContent = title;
  el("prompt-input").value = value;
  el("prompt-modal").classList.remove("hidden");
  const input = el("prompt-input");
  input.focus();
  input.select();
  return new Promise((res) => {
    resolver = res;
  });
}

export function initPrompt() {
  el("prompt-ok").onclick = () => done(el("prompt-input").value.trim() || null);
  el("prompt-cancel").onclick = () => done(null);
  el("prompt-modal").onclick = (e) => {
    if (e.target.id === "prompt-modal") done(null);
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
