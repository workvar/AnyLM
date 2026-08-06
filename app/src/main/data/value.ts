// Codec for Firestore's REST wire format.
//
// The REST API does not take plain JSON. Every field is tagged with its type
// ({ stringValue: "x" }, { integerValue: "5" }), and integers arrive as
// strings because JSON numbers cannot hold int64. The Admin SDK hides all of
// this; without a server we have to do it ourselves.
//
// Timestamps decode to Date. The API router converts those to ISO strings on
// the way to the renderer, which is the shape it already expects.

export type FsValue = Record<string, unknown>;
export type FsFields = Record<string, FsValue>;

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function encode(v: unknown): FsValue {
  if (v === null || v === undefined) return { nullValue: null };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") {
    // Firestore distinguishes int64 from double. Keeping whole numbers as
    // integers matters for the token counters we sum.
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encode) } };
  if (typeof v === "object") return { mapValue: { fields: encodeFields(v as Record<string, unknown>) } };
  return { stringValue: String(v) };
}

export function encodeFields(obj: Record<string, unknown>): FsFields {
  const out: FsFields = {};
  // undefined means "leave alone", matching how the Admin SDK behaved. Callers
  // that want to clear a field pass null.
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = encode(v);
  return out;
}

export function decode(v: FsValue | undefined): unknown {
  if (!v) return null;
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue as boolean;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return Number(v.doubleValue);
  if ("timestampValue" in v) return new Date(v.timestampValue as string);
  if ("stringValue" in v) {
    // Dates written by another client may land here as plain strings; keep
    // them comparable with the ones we wrote.
    const s = v.stringValue as string;
    return RFC3339.test(s) ? new Date(s) : s;
  }
  if ("arrayValue" in v) {
    const arr = (v.arrayValue as { values?: FsValue[] }).values || [];
    return arr.map(decode);
  }
  if ("mapValue" in v) {
    return decodeFields((v.mapValue as { fields?: FsFields }).fields || {});
  }
  if ("bytesValue" in v) return v.bytesValue;
  return null;
}

export function decodeFields(fields: FsFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) out[k] = decode(v);
  return out;
}

/** Last path segment of `projects/../documents/col/id` is the document id. */
export function idFromName(name: string): string {
  return (name || "").split("/").pop() || "";
}
