// Progress list in the right rail: one row per tool run in this turn.
import { el, node } from "../dom.js";
import { detailNode } from "../linkify.js";

interface Step {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

let steps: Step[] = [];

function render() {
  const wrap = el("rail-progress");
  wrap.innerHTML = "";
  if (!steps.length) {
    wrap.appendChild(node("div", "rail-empty", "Nothing running."));
    return;
  }
  for (const s of steps) {
    const row = node("div", `rail-step${s.done ? " done" : ""}`);
    row.appendChild(node("span", "rail-tick", s.done ? "✓" : "•"));
    const text = node("div", "rail-step-text");
    text.appendChild(node("div", "rail-step-label", s.label));
    if (s.detail) text.appendChild(detailNode("rail-step-detail", s.detail));
    row.appendChild(text);
    wrap.appendChild(row);
  }
}

// A tool started. `key` groups the running row with its completion.
export function startStep(key: string, label: string, detail: string) {
  steps.push({ key, label, done: false, detail });
  render();
}

export function finishStep(key: string, detail: string) {
  const open = [...steps].reverse().find((s) => s.key === key && !s.done);
  if (open) {
    open.done = true;
    open.detail = detail || open.detail;
  }
  render();
}

// A plain informational row (e.g. "Wrote report.pdf").
export function noteStep(label: string, detail = "") {
  steps.push({ key: `note:${label}`, label, done: true, detail });
  render();
}

export function resetProgress() {
  steps = [];
  render();
}
