// Context-window utilization meter. Shows estimated tokens vs the model's
// context length. Estimates locally on open, refines from server usage per
// turn, and updates live as the user types. Surfaces a "Compact" action when
// the window is getting full.
import { el } from "./dom.js";

const WARN_AT = 80; // percent at which we warn + offer compaction

let ctx = 4096; // model context length
let baseTokens = 0; // tokens of the committed conversation

const approx = (text) => Math.ceil((text || "").length / 4);

function fmt(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

function paint(tokens) {
  const percent = Math.min(100, Math.round((tokens / ctx) * 100));
  el("ctx-meter").classList.remove("hidden");
  el("ctx-bar").style.width = `${percent}%`;
  el("ctx-bar").classList.toggle("warn", percent >= WARN_AT);
  el("ctx-text").textContent = `Context ~${fmt(tokens)} / ${fmt(ctx)} tokens (${percent}%)`;
  el("ctx-compact").classList.toggle("hidden", percent < WARN_AT);
}

// Precise figures from the server after a completed turn.
export function setContextUsage(usage) {
  if (!usage) return;
  ctx = usage.ctx || ctx;
  baseTokens = usage.tokens;
  paint(baseTokens);
}

// Estimate from messages when opening a conversation/thread.
export async function estimateContext(model, messages) {
  try {
    const got = await window.api.modelInfo(model);
    if (got) ctx = got;
  } catch {
    /* keep previous ctx */
  }
  baseTokens = (messages || []).reduce((n, m) => n + approx(m.content), 0);
  paint(baseTokens);
}

// Live update as the user types (committed base + draft).
export function updateDraft(text) {
  if (el("ctx-meter").classList.contains("hidden")) return;
  paint(baseTokens + approx(text));
}

export function hideContext() {
  el("ctx-meter").classList.add("hidden");
}
