// Client-side governance for the signed-in user. Fetches effective policies
// and limits from the Firebase API, evaluates prompt-content policies
// locally, and defers limits / budgets / rate / model checks to the
// authoritative server.
//
// The evaluation itself moved to policy-engine.js so the local /v1 proxy can
// reuse it for API-key callers, who are a different user than whoever is
// signed into the UI.
import * as auth from "./auth";
import * as engine from "./policy-engine";

const TTL_MS = 30_000;
let cache = { at: 0, data: null };

async function effective(force = false) {
  if (!force && cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  try {
    const data = await auth.request("GET", "/policies/effective");
    cache = { at: Date.now(), data };
    return data;
  } catch {
    return cache.data || { policies: [], limits: [] };
  }
}

function invalidate() {
  cache = { at: 0, data: null };
}

// Run content_filter + pii policies over a prompt.
// Returns { blocked, reason, text, warnings }; `text` may be redacted.
async function evaluatePrompt(text) {
  const { policies } = await effective();
  return engine.evaluatePrompt(text, policies);
}

// Server-side pre-flight: token limits, budgets, rate limits, model allowlist.
// `promptTokens` is a local estimate used by token_limit policies.
// Fails open with a warning if the backend is unreachable (local-first app).
async function preflight(model, promptTokens = 0) {
  try {
    return await auth.request("POST", "/usage/check", { model, promptTokens });
  } catch (e) {
    if (/Not authenticated/.test(e.message)) {
      return { allowed: false, reason: "Not signed in.", warnings: [] };
    }
    return {
      allowed: true,
      warnings: ["Governance service unreachable; limits not enforced for this request."],
    };
  }
}

// Fire-and-forget usage report with real token counts from Ollama.
function report(model, promptTokens, completionTokens) {
  auth
    .request("POST", "/usage/report", { model, promptTokens, completionTokens })
    .then(() => invalidate())
    .catch(() => {});
}

// Filter a model list through blocking model_allowlist policies.
async function filterModels(models) {
  const { policies } = await effective();
  return engine.filterModels(models, policies);
}

export { effective, invalidate, evaluatePrompt, preflight, report, filterModels };

