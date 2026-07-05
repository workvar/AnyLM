// Client-side governance engine. Fetches the user's effective policies and
// limits from the backend, evaluates prompt-content policies locally, and
// defers limits / budgets / rate / model checks to the authoritative server.
const auth = require("./auth");
const pii = require("./pii");

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

function parseConfig(p) {
  try {
    return JSON.parse(p.config) || {};
  } catch {
    return {};
  }
}

// Run content_filter + pii policies over a prompt.
// Returns { blocked, reason, text, warnings } — `text` may be redacted.
async function evaluatePrompt(text) {
  const out = { blocked: false, reason: "", text, warnings: [] };
  if (!text || !text.trim()) return out;
  const { policies } = await effective();

  for (const p of policies) {
    if (!p.enabled) continue;
    const cfg = parseConfig(p);

    if (p.type === "content_filter") {
      const patterns = Array.isArray(cfg.patterns) ? cfg.patterns : [];
      for (const pat of patterns) {
        let hit = false;
        let re = null;
        if (cfg.regex) {
          try {
            re = new RegExp(pat, "gi");
            hit = re.test(out.text);
            re.lastIndex = 0;
          } catch {
            hit = false;
          }
        } else {
          hit = out.text.toLowerCase().includes(String(pat).toLowerCase());
        }
        if (!hit) continue;
        if (p.action === "block") {
          out.blocked = true;
          out.reason = `Blocked by policy "${p.name}": prompt matches a restricted pattern.`;
          return out;
        }
        if (p.action === "redact") {
          out.text = cfg.regex
            ? out.text.replace(re, "[REDACTED]")
            : out.text.replace(new RegExp(escapeRe(String(pat)), "gi"), "[REDACTED]");
          out.warnings.push(`Policy "${p.name}" redacted restricted content.`);
        } else {
          out.warnings.push(`Policy "${p.name}": prompt matches a flagged pattern.`);
        }
      }
    }

    if (p.type === "pii") {
      const { found, text: redacted } = pii.scan(out.text, cfg.types);
      if (!found.length) continue;
      const kinds = found.join(", ");
      if (p.action === "block") {
        out.blocked = true;
        out.reason = `Blocked by policy "${p.name}": prompt contains PII (${kinds}).`;
        return out;
      }
      if (p.action === "redact") {
        out.text = redacted;
        out.warnings.push(`Policy "${p.name}" redacted PII (${kinds}).`);
      } else {
        out.warnings.push(`Policy "${p.name}": prompt contains PII (${kinds}).`);
      }
    }
  }
  return out;
}

// Server-side pre-flight: token limits, budgets, rate limits, model allowlist.
// `promptTokens` is a local estimate used by token_limit policies.
// Fails open with a warning if the backend is unreachable (local-first app).
async function preflight(model, promptTokens = 0) {
  try {
    return await auth.request("POST", "/usage/check", { model, promptTokens });
  } catch (e) {
    if (/Not authenticated/.test(e.message)) return { allowed: false, reason: "Not signed in.", warnings: [] };
    return { allowed: true, warnings: ["Governance service unreachable; limits not enforced for this request."] };
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
  let list = models;
  for (const p of policies) {
    if (p.type !== "model_allowlist" || !p.enabled || p.action === "warn") continue;
    const cfg = parseConfig(p);
    const allowed = Array.isArray(cfg.models) ? cfg.models : [];
    if (allowed.length) list = list.filter((m) => allowed.includes(m));
  }
  return list;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = { effective, invalidate, evaluatePrompt, preflight, report, filterModels };
