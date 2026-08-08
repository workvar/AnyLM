// Apple-style model picker. A custom popup menu (not a native <select>) so it
// matches macOS styling, shows a checkmark on the active item, supports keyboard
// navigation, and reveals a search field once there are more than 5 models.
import { el, node } from "./dom.js";

const SEARCH_THRESHOLD = 5;

let models = [];
let selected = "";
let query = "";
let open = false;
let highlight = -1;
let enabled = true;
let lockMessage: string | null = null;
let onChange: (value: string) => void = () => {};

function showLockPopover() {
  const tip = el("model-lock-popover");
  if (!tip || !lockMessage) return;
  tip.textContent = lockMessage;
  tip.classList.remove("hidden");
}

function hideLockPopover() {
  el("model-lock-popover")?.classList.add("hidden");
}

function filtered() {
  const q = query.trim().toLowerCase();
  return q ? models.filter((m) => m.toLowerCase().includes(q)) : models;
}

function setLabel() {
  el("model-current").textContent = selected || "No models";
}

function paintHighlight() {
  el("model-options")
    .querySelectorAll(".dropdown-option")
    .forEach((o, i) => o.classList.toggle("active", i === highlight));
}

function scrollToHighlight() {
  const opts = el("model-options").querySelectorAll(".dropdown-option");
  if (opts[highlight]) opts[highlight].scrollIntoView({ block: "nearest" });
}

function renderOptions() {
  const list = el("model-options");
  list.innerHTML = "";
  const items = filtered();
  if (!items.length) {
    list.appendChild(node("li", "dropdown-empty", "No matches"));
    return;
  }
  items.forEach((m, i) => {
    const li = node("li", "dropdown-option" + (i === highlight ? " active" : ""));
    li.setAttribute("role", "option");
    li.appendChild(node("span", "check", m === selected ? "✓" : ""));
    li.appendChild(node("span", "label", m));
    li.onmousemove = () => {
      highlight = i;
      paintHighlight();
    };
    li.onclick = () => choose(m);
    list.appendChild(li);
  });
}

function openMenu() {
  if (!models.length) return;
  open = true;
  query = "";
  const many = models.length > SEARCH_THRESHOLD;
  el("model-search-wrap").classList.toggle("hidden", !many);
  el("model-search").value = "";
  highlight = Math.max(0, filtered().indexOf(selected));
  renderOptions();
  el("model-menu").classList.remove("hidden");
  el("model-trigger").setAttribute("aria-expanded", "true");
  if (many) el("model-search").focus();
  scrollToHighlight();
}

function close() {
  open = false;
  query = "";
  highlight = -1;
  el("model-menu").classList.add("hidden");
  el("model-trigger").setAttribute("aria-expanded", "false");
}

function choose(value) {
  if (!value) return;
  selected = value;
  setLabel();
  close();
  onChange(value);
}

function move(delta) {
  const n = filtered().length;
  if (!n) return;
  highlight = (highlight + delta + n) % n;
  paintHighlight();
  scrollToHighlight();
}

export function initModelDropdown(onChangeCb) {
  onChange = onChangeCb || (() => {});
  const trigger = el("model-trigger");
  trigger.onclick = (e) => {
    e.stopPropagation();
    if (!enabled) return;
    open ? close() : openMenu();
  };
  trigger.addEventListener("mouseenter", () => {
    if (!enabled && lockMessage) showLockPopover();
  });
  trigger.addEventListener("mouseleave", hideLockPopover);
  trigger.addEventListener("focus", () => {
    if (!enabled && lockMessage) showLockPopover();
  });
  trigger.addEventListener("blur", hideLockPopover);
  el("model-menu").onclick = (e) => e.stopPropagation();
  el("model-search").oninput = (e) => {
    query = (e.target as UiElement).value;
    highlight = 0;
    renderOptions();
  };
  document.addEventListener("click", () => open && close());
  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") close();
    else if (e.key === "ArrowDown") (e.preventDefault(), move(1));
    else if (e.key === "ArrowUp") (e.preventDefault(), move(-1));
    else if (e.key === "Enter") (e.preventDefault(), choose(filtered()[highlight]));
  });
}

// Replaces the old native-select population. Sets the model list + selection.
export function setModelDropdown(modelList, selectedValue) {
  models = modelList || [];
  selected = selectedValue || models[0] || "";
  setLabel();
  if (open) renderOptions();
}

export function getSelectedModel() {
  return selected;
}

// Disable the picker (used when a project locks its model or chat has started).
export function setModelDropdownEnabled(value: boolean, reasonMessage: string | null = null) {
  enabled = value;
  lockMessage = value ? null : reasonMessage;
  const trigger = el("model-trigger");
  trigger.classList.toggle("disabled", !value);
  trigger.setAttribute("aria-disabled", String(!value));
  if (value) {
    trigger.removeAttribute("aria-describedby");
    hideLockPopover();
  } else if (lockMessage) {
    trigger.setAttribute("aria-describedby", "model-lock-popover");
  }
  if (!value && open) close();
}
