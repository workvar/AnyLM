// Per-response token stats: real Ollama counts when available, ~estimate otherwise.
export function attachTokenStats(bubble, usage) {
  if (!usage || usage.promptTokens == null) return;
  const tag = usage.measured ? "" : "~";
  const s = document.createElement("div");
  s.className = "token-stats";
  s.title = usage.measured
    ? "Measured by the model (prompt_eval_count / eval_count)"
    : "Estimated (~4 characters per token)";
  s.textContent = `${tag}${fmt(usage.promptTokens)} prompt + ${tag}${fmt(usage.completionTokens)} completion = ${tag}${fmt(
    usage.promptTokens + usage.completionTokens
  )} tokens`;
  bubble.insertAdjacentElement("afterend", s);
}

function fmt(n) {
  return Number(n || 0).toLocaleString();
}
