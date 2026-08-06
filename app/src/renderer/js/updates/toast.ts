// Draws the update toast. Two forms of the same element:
//   expanded — a small card in the bottom-right corner
//   collapsed — a pill with a progress ring, percent, and transfer rate
// Nothing here decides *what* to show; index.js owns that.
import { el, node } from "../dom.js";
import { progressLine, speed } from "./format.js";

const RING_CIRCUMFERENCE = 2 * Math.PI * 9; // r=9 in the SVG below

let collapsed = false;
let onToggle: (...args: any[]) => void = () => {};

export function setToggleHandler(fn) {
  onToggle = fn;
}

export function hide() {
  el("update-toast").classList.add("hidden");
  collapsed = false;
  el("update-toast").dataset.collapsed = "false";
}

export function isCollapsed() {
  return collapsed;
}

export function collapse(yes) {
  collapsed = yes;
  el("update-toast").dataset.collapsed = String(yes);
}

function setActions(buttons) {
  const wrap = el("up-actions");
  wrap.innerHTML = "";
  wrap.classList.toggle("hidden", buttons.length === 0);
  for (const b of buttons) {
    const btn = node("button", b.primary ? "primary small" : "ghost small", b.label);
    btn.onclick = b.onClick;
    wrap.appendChild(btn);
  }
}

// Percent may be null to hide the bar entirely.
function setProgress(percent) {
  el("up-progress").classList.toggle("hidden", percent === null);
  if (percent === null) return;
  el("up-bar").style.width = `${percent}%`;
  const ring = el("up-ring-fill");
  ring.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  ring.style.strokeDashoffset = String(RING_CIRCUMFERENCE * (1 - percent / 100));
}

export function show({ title, msg = "", notes = "", percent = null, stats = "", pill = "", actions = [] }) {
  el("up-title").textContent = title;
  el("up-msg").textContent = msg;
  el("up-msg").classList.toggle("hidden", !msg);

  el("up-notes").textContent = notes;
  el("up-notes").classList.toggle("hidden", !notes);

  setProgress(percent);

  el("up-stats").textContent = stats;
  el("up-stats").classList.toggle("hidden", !stats);

  el("up-pill-text").textContent = pill || title;
  el("up-toast-ring").classList.toggle("hidden", percent === null);

  setActions(actions);
  el("update-toast").classList.remove("hidden");
}

// Convenience wrapper used while a download is in flight.
export function showDownloading(s, actions) {
  const percent = Math.round(s.percent || 0);
  show({
    title: `Downloading v${s.version || ""}`.trim(),
    msg: "",
    percent,
    stats: progressLine(s),
    pill: `${percent}% · ${speed(s.bytesPerSecond)}`,
    actions,
  });
}

export function bind() {
  el("up-collapse").onclick = () => onToggle(true);
  el("up-pill").onclick = () => onToggle(false);
}
