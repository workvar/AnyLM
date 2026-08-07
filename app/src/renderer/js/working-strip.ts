// Sticky “Working” strip above the composer for the open busy turn,
// or a compact multi-chat indicator when the open turn is idle.
import { el } from "./dom.js";
import type { WorkingStripState } from "./working-strip-mode.js";

type StripActions = {
  stop: () => void;
  confirm: (token: string, approved: boolean) => void;
};

let actions: StripActions = {
  stop: () => {},
  confirm: () => {},
};
let confirmToken: string | undefined;
let bound = false;

/** Wire Stop / Allow / Deny (called from turns to avoid a circular import). */
export function setWorkingStripActions(next: StripActions): void {
  actions = next;
}

export function initWorkingStrip(): void {
  if (bound) return;
  bound = true;

  el("working-stop").onclick = () => actions.stop();
  el("working-allow").onclick = () => {
    if (!confirmToken) return;
    actions.confirm(confirmToken, true);
  };
  el("working-deny").onclick = () => {
    if (!confirmToken) return;
    actions.confirm(confirmToken, false);
  };
}

export function paintWorkingStrip(state: WorkingStripState | null): void {
  const strip = el("working-strip");
  const titleEl = el("working-strip-title");
  const labelEl = el("working-strip-label");
  const allow = el("working-allow");
  const deny = el("working-deny");
  const stop = el("working-stop");

  if (!state) {
    strip.classList.add("hidden");
    strip.classList.remove("is-compact");
    confirmToken = undefined;
    allow.classList.add("hidden");
    deny.classList.add("hidden");
    stop.classList.remove("hidden");
    titleEl.textContent = "1 Working";
    labelEl.textContent = "";
    return;
  }

  strip.classList.remove("hidden");

  if (state.mode === "compact") {
    strip.classList.add("is-compact");
    confirmToken = undefined;
    titleEl.textContent = state.title;
    labelEl.textContent = state.label;
    allow.classList.add("hidden");
    deny.classList.add("hidden");
    stop.classList.add("hidden");
    return;
  }

  strip.classList.remove("is-compact");
  titleEl.textContent = "1 Working";
  labelEl.textContent = state.label;
  confirmToken = state.confirmToken;
  const showConfirm = !!state.confirmToken;
  allow.classList.toggle("hidden", !showConfirm);
  deny.classList.toggle("hidden", !showConfirm);
  stop.classList.remove("hidden");
}
