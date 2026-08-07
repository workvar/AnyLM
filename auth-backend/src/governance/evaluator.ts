// Server-side prompt evaluation for content_filter and pii policies.
// Mirrors the Electron client's engine so API-key traffic through the /v1
// proxy is governed identically.
import { Policy } from "@prisma/client";

const PII_PATTERNS: Record<string, RegExp> = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)[-.\s]?)?\d{3,4}[-.\s]\d{3,4}(?:[-.\s]\d{2,4})?/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

const PII_LABELS: Record<string, string> = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  ssn: "[SSN]",
  credit_card: "[CARD]",
  ip_address: "[IP]",
};

export interface Verdict {
  blocked: boolean;
  reason: string;
  text: string;
  warnings: string[];
}

function parse(json: string): Record<string, unknown> {
  try {
    return JSON.parse(json) || {};
  } catch {
    return {};
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function evaluatePrompt(text: string, policies: Policy[]): Verdict {
  const out: Verdict = { blocked: false, reason: "", text, warnings: [] };
  if (!text || !text.trim()) return out;

  for (const p of policies) {
    if (!p.enabled) continue;
    const cfg = parse(p.config);

    if (p.type === "content_filter") {
      const patterns = Array.isArray(cfg.patterns) ? (cfg.patterns as string[]) : [];
      for (const pat of patterns) {
        let re: RegExp | null = null;
        let hit = false;
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
          out.text = cfg.regex && re
            ? out.text.replace(re, "[REDACTED]")
            : out.text.replace(new RegExp(escapeRe(String(pat)), "gi"), "[REDACTED]");
          out.warnings.push(`Policy "${p.name}" redacted restricted content.`);
        } else {
          out.warnings.push(`Policy "${p.name}": prompt matches a flagged pattern.`);
        }
      }
    }

    if (p.type === "pii") {
      const types =
        Array.isArray(cfg.types) && (cfg.types as string[]).length
          ? (cfg.types as string[])
          : Object.keys(PII_PATTERNS);
      const found: string[] = [];
      let redacted = out.text;
      for (const t of types) {
        const re = PII_PATTERNS[t];
        if (!re) continue;
        if (re.test(redacted)) {
          found.push(t);
          redacted = redacted.replace(re, PII_LABELS[t] || "[REDACTED]");
        }
        re.lastIndex = 0;
      }
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
