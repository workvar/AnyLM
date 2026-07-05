// PII detection and redaction for governance policies.
const PATTERNS = {
  email: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
  phone: /(?:\+?\d{1,3}[-.\s]?)?(?:\(\d{2,4}\)[-.\s]?)?\d{3,4}[-.\s]\d{3,4}(?:[-.\s]\d{2,4})?/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  credit_card: /\b(?:\d[ -]*?){13,16}\b/g,
  ip_address: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
};

const LABELS = {
  email: "[EMAIL]",
  phone: "[PHONE]",
  ssn: "[SSN]",
  credit_card: "[CARD]",
  ip_address: "[IP]",
};

// types: subset of Object.keys(PATTERNS); empty/missing = all.
// Returns { found: string[], text } where text has matches replaced.
function scan(text, types) {
  const active = Array.isArray(types) && types.length ? types : Object.keys(PATTERNS);
  const found = [];
  let out = text;
  for (const t of active) {
    const re = PATTERNS[t];
    if (!re) continue;
    if (re.test(out)) {
      found.push(t);
      out = out.replace(re, LABELS[t] || "[REDACTED]");
    }
    re.lastIndex = 0;
  }
  return { found, text: out };
}

module.exports = { scan, TYPES: Object.keys(PATTERNS) };
