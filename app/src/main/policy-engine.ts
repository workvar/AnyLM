// Pure policy evaluation over a list of policies. No network, no caching,
// no notion of who is signed in.
//
// Extracted so two callers can share it: governance.js, which evaluates on
// behalf of the signed-in user, and the local /v1 proxy, which evaluates on
// behalf of whoever owns the API key in the request. Before the Firebase
// move this logic existed twice, once here and once in the backend's
// evaluator.ts, and the two could drift.
import * as pii from "./pii";

function parseConfig(p) {
  try {
    return JSON.parse(p.config) || {};
  } catch {
    return {};
  }
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyContentFilter(p, cfg, out) {
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
      return true;
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
  return false;
}

function applyPii(p, cfg, out) {
  const { found, text: redacted } = pii.scan(out.text, cfg.types);
  if (!found.length) return false;
  const kinds = found.join(", ");

  if (p.action === "block") {
    out.blocked = true;
    out.reason = `Blocked by policy "${p.name}": prompt contains PII (${kinds}).`;
    return true;
  }
  if (p.action === "redact") {
    out.text = redacted;
    out.warnings.push(`Policy "${p.name}" redacted PII (${kinds}).`);
  } else {
    out.warnings.push(`Policy "${p.name}": prompt contains PII (${kinds}).`);
  }
  return false;
}

// Run content_filter + pii policies over a prompt.
// Returns { blocked, reason, text, warnings }; `text` may be redacted.
function evaluatePrompt(text, policies) {
  const out = { blocked: false, reason: "", text, warnings: [] };
  if (!text || !text.trim()) return out;

  for (const p of policies || []) {
    if (!p.enabled) continue;
    const cfg = parseConfig(p);
    if (p.type === "content_filter" && applyContentFilter(p, cfg, out)) return out;
    if (p.type === "pii" && applyPii(p, cfg, out)) return out;
  }
  return out;
}

// Filter a model list through blocking model_allowlist policies.
function filterModels(models, policies) {
  let list = models;
  for (const p of policies || []) {
    if (p.type !== "model_allowlist" || !p.enabled || p.action === "warn") continue;
    const cfg = parseConfig(p);
    const allowed = Array.isArray(cfg.models) ? cfg.models : [];
    if (allowed.length) list = list.filter((m) => allowed.includes(m));
  }
  return list;
}

export { evaluatePrompt, filterModels, parseConfig };

