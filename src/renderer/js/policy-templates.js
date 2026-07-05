// One-click governance policy presets.
export const POLICY_TEMPLATES = [
  {
    id: "hipaa",
    label: "HIPAA preset",
    description: "Blocks prompts containing PHI identifiers (SSNs, phones, emails) and common medical-record patterns.",
    policies: [
      { type: "pii", name: "HIPAA: block PHI identifiers", action: "block", config: { types: ["ssn", "phone", "email"] } },
      {
        type: "content_filter",
        name: "HIPAA: medical record numbers",
        action: "block",
        config: { patterns: ["\\bMRN[-:\\s]?\\d{5,}\\b", "\\bmedical record (number|no\\.?)\\b"], regex: true },
      },
    ],
  },
  {
    id: "pii-strict",
    label: "PII strict",
    description: "Redacts all detected PII (emails, phones, SSNs, cards, IPs) before prompts reach any model.",
    policies: [
      { type: "pii", name: "PII strict: redact everything", action: "redact", config: { types: ["email", "phone", "ssn", "credit_card", "ip_address"] } },
    ],
  },
  {
    id: "no-secrets",
    label: "No secrets",
    description: "Blocks API keys, private keys, and credential-looking strings.",
    policies: [
      {
        type: "content_filter",
        name: "No secrets: keys & credentials",
        action: "block",
        config: {
          patterns: ["-----BEGIN [A-Z ]*PRIVATE KEY-----", "\\b(sk|pk|api|key|token|secret)[-_][A-Za-z0-9]{16,}\\b", "password\\s*[:=]\\s*\\S+"],
          regex: true,
        },
      },
    ],
  },
  {
    id: "token-budget",
    label: "Token budget",
    description: "Caps prompts at 4k tokens per request and 100k total tokens per day.",
    policies: [
      {
        type: "token_limit",
        name: "Token budget: 4k/request, 100k/day",
        action: "block",
        config: { maxPerRequest: 4000, maxPerDay: 100000 },
      },
    ],
  },
  {
    id: "office-hours",
    label: "Office hours only",
    description: "Restricts LLM access to 9:00–18:00 with a 100 requests/hour ceiling.",
    policies: [
      { type: "rate_limit", name: "Office hours: 9–18, 100/hr", action: "block", config: { startHour: 9, endHour: 18, maxPerHour: 100 } },
    ],
  },
];
