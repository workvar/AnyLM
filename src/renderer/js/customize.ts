// Customize: personal context applied to every chat. Saves as you type.
// Lives in the Settings hub Customize panel (not a modal).
import { el } from "./dom.js";

const FIELDS = {
  "uc-name": "name",
  "uc-about": "about",
  "uc-work": "work",
  "uc-style": "style",
  "uc-extra": "extra",
};

let timer;

function flashSaved() {
  const note = el("uc-saved");
  if (!note) return;
  note.textContent = "Saved";
  clearTimeout(timer);
  timer = setTimeout(() => (note.textContent = ""), 1200);
}

async function save(patch) {
  await window.api.userContextSet(patch);
  flashSaved();
}

let debounce;
function scheduleSave(patch) {
  clearTimeout(debounce);
  debounce = setTimeout(() => save(patch), 400);
}

/** Paint Customize fields from storage (hub section loader). */
export async function paintCustomize() {
  const ctx = await window.api.userContextGet();
  el("uc-enabled").checked = ctx.enabled !== false;
  for (const [id, key] of Object.entries(FIELDS)) el(id).value = ctx[key] || "";
  const note = el("uc-saved");
  if (note) note.textContent = "";
}

export function initCustomize() {
  for (const [id, key] of Object.entries(FIELDS)) {
    el(id).oninput = (e) => scheduleSave({ [key]: (e.target as UiElement).value });
  }
  el("uc-enabled").onchange = (e) => save({ enabled: (e.target as UiElement).checked });
}
