// Sticky “Working” strip above the composer for the open busy turn.
import { el } from "./dom.js";

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

export function paintWorkingStrip(
  state: null | { label: string; confirmToken?: string }
): void {
  const strip = el("working-strip");
  if (!state) {
    strip.classList.add("hidden");
    confirmToken = undefined;
    el("working-allow").classList.add("hidden");
    el("working-deny").classList.add("hidden");
    el("working-strip-label").textContent = "";
    return;
  }

  strip.classList.remove("hidden");
  el("working-strip-label").textContent = state.label;
  confirmToken = state.confirmToken;
  const showConfirm = !!state.confirmToken;
  el("working-allow").classList.toggle("hidden", !showConfirm);
  el("working-deny").classList.toggle("hidden", !showConfirm);
}
