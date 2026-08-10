// Customize: personal context applied to every chat. Saves as you type.
// Lives in the Settings hub Customize panel (not a modal).
import { el } from "./dom.js";
import {
  clampCustomizeStep,
  nextCustomizeStep,
  prevCustomizeStep,
  customizePrimaryLabel,
  type CustomizeStep,
} from "./customize-steps.js";

const FIELDS = {
  "uc-name": "name",
  "uc-about": "about",
  "uc-work": "work",
  "uc-style": "style",
  "uc-extra": "extra",
};

const STEP_TITLES: Record<CustomizeStep, string> = {
  1: "Who you are",
  2: "What you work on",
  3: "How to reply",
};

let step: CustomizeStep = 1;
let timer;
let debounce;

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

function scheduleSave(patch) {
  clearTimeout(debounce);
  debounce = setTimeout(() => save(patch), 400);
}

function paintStep() {
  const root = document.querySelector(".customize-wizard");
  if (!root) return;
  root.setAttribute("data-step", String(step));
  for (const panel of root.querySelectorAll<HTMLElement>("[data-step-panel]")) {
    const n = Number(panel.dataset.stepPanel);
    panel.classList.toggle("hidden", n !== step);
  }
  for (const pill of root.querySelectorAll<HTMLElement>("[data-step-n]")) {
    const n = Number(pill.dataset.stepN) as CustomizeStep;
    pill.classList.toggle("is-current", n === step);
    pill.classList.toggle("is-done", n < step);
    if (n === step) pill.setAttribute("aria-current", "step");
    else pill.removeAttribute("aria-current");
  }
  const title = el("customize-step-title");
  if (title) title.textContent = STEP_TITLES[step];
  const back = el("customize-back") as HTMLButtonElement;
  const next = el("customize-next") as HTMLButtonElement;
  if (back) back.disabled = step === 1;
  if (next) next.textContent = customizePrimaryLabel(step);
}

/** Paint Customize fields from storage (hub section loader). */
export async function paintCustomize() {
  const ctx = await window.api.userContextGet();
  el("uc-enabled").checked = ctx.enabled !== false;
  for (const [id, key] of Object.entries(FIELDS)) el(id).value = ctx[key] || "";
  const note = el("uc-saved");
  if (note) note.textContent = "";
  step = clampCustomizeStep(step);
  paintStep();
}

export function initCustomize() {
  for (const [id, key] of Object.entries(FIELDS)) {
    el(id).oninput = (e) => scheduleSave({ [key]: (e.target as UiElement).value });
  }
  el("uc-enabled").onchange = (e) => save({ enabled: (e.target as UiElement).checked });

  el("customize-back").onclick = () => {
    step = prevCustomizeStep(step);
    paintStep();
  };
  el("customize-next").onclick = () => {
    if (step === 3) {
      // Done: stay on step 3; optional brief indicator — do not close Settings.
      paintStep();
      return;
    }
    step = nextCustomizeStep(step);
    paintStep();
  };
  paintStep();
}
