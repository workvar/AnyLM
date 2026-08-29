// Firestore REST wants every field wrapped as { stringValue: ... } /
// { integerValue: ... } / etc. This is a minimal encoder for the plain JS
// values the webhook handlers produce — not a general codec, just enough
// for the shapes githubProjects/githubProjectItems actually need. Mirrors
// the wrapping convention app/src/main/data/value.ts uses on the app side,
// so a document written by either one reads back the same way.
export type FirestoreFields = Record<string, unknown>;

function encodeValue(v: unknown): Record<string, unknown> {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) {
    return { arrayValue: { values: v.map(encodeValue) } };
  }
  if (typeof v === "object") {
    return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  }
  return { stringValue: String(v) };
}

export function encodeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(obj)) out[k] = encodeValue(val);
  return out;
}
