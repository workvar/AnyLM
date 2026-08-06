// Firestore REST transport, authenticated as the signed-in user.
//
// Every request carries the user's Firebase ID token, so firestore.rules
// applies exactly as it would to a browser client. That is the whole security
// model now that there is no server: the rules are the only thing between a
// user and someone else's data, which is why they are written as tightly as
// they are.
import { projectId } from "../firebase-config";

const BASE = "https://firestore.googleapis.com/v1";

function root(): string {
  return `projects/${projectId}/databases/(default)/documents`;
}

export function docPath(collection: string, id: string): string {
  return `${root()}/${collection}/${id}`;
}

// Supplied by auth.ts at startup. Injected rather than imported to keep this
// module free of a cycle: auth.ts needs the API router, which needs this.
let tokenProvider: (() => Promise<string>) | null = null;

export function useTokenProvider(fn: () => Promise<string>): void {
  tokenProvider = fn;
}

async function bearer(): Promise<string> {
  if (!tokenProvider) throw new Error("Not authenticated");
  return tokenProvider();
}

export class FirestoreError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${await bearer()}`,
    },
    body: body != null ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = data?.error?.message || `Firestore request failed (${res.status})`;
    // Rules rejections come back as 403 PERMISSION_DENIED. Translate to the
    // wording the UI already shows for role failures.
    if (res.status === 403) throw new FirestoreError(403, "Insufficient permissions");
    throw new FirestoreError(res.status, message);
  }
  return data as T;
}

export interface RawDoc {
  name: string;
  fields?: Record<string, Record<string, unknown>>;
}

/** Single document read. Returns null on 404 rather than throwing. */
export async function getDoc(path: string): Promise<RawDoc | null> {
  try {
    return await call<RawDoc>("GET", `${BASE}/${path}`);
  } catch (e) {
    if (e instanceof FirestoreError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Fetch many documents in one round trip. `paths` are resource names of the
 * form `projects/../documents/<collection>/<id>`, which is what docPath()
 * returns. Missing documents are simply absent from the result.
 */
export async function batchGet(paths: string[]): Promise<RawDoc[]> {
  if (!paths.length) return [];
  const out: RawDoc[] = [];
  // The endpoint caps how many it will take at once; chunk well inside it.
  for (let i = 0; i < paths.length; i += 100) {
    const res = await call<{ found?: RawDoc; missing?: string }[]>(
      "POST",
      `${BASE}/${root()}:batchGet`,
      { documents: paths.slice(i, i + 100) }
    );
    for (const row of res) if (row.found) out.push(row.found);
  }
  return out;
}

/** Create with a server-assigned id. */
export function createDoc(collection: string, fields: unknown): Promise<RawDoc> {
  return call<RawDoc>("POST", `${BASE}/${root()}/${collection}`, { fields });
}

/** Full overwrite. */
export function setDoc(path: string, fields: unknown): Promise<RawDoc> {
  return call<RawDoc>("PATCH", `${BASE}/${path}`, { fields });
}

/** Merge: only the named fields are touched. */
export function updateDoc(path: string, fields: Record<string, unknown>): Promise<RawDoc> {
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");
  return call<RawDoc>("PATCH", `${BASE}/${path}?${mask}`, { fields });
}

export async function deleteDoc(path: string): Promise<void> {
  await call("DELETE", `${BASE}/${path}`);
}

/** Structured query. Rows without a `document` are read-time metadata. */
export async function runQuery(query: unknown): Promise<RawDoc[]> {
  const rows = await call<{ document?: RawDoc }[]>("POST", `${BASE}/${root()}:runQuery`, {
    structuredQuery: query,
  });
  return rows.filter((r) => r.document).map((r) => r.document as RawDoc);
}

/** Server-side sum/count. Cheap: one read per 1000 documents scanned. */
export async function runAggregation(
  query: unknown,
  aggregations: unknown[]
): Promise<Record<string, unknown>> {
  const rows = await call<{ result?: { aggregateFields?: Record<string, unknown> } }[]>(
    "POST",
    `${BASE}/${root()}:runAggregationQuery`,
    { structuredAggregationQuery: { structuredQuery: query, aggregations } }
  );
  return rows[0]?.result?.aggregateFields || {};
}

/** Atomic multi-document write, used for the delete sweeps. */
export async function commit(writes: unknown[]): Promise<void> {
  if (!writes.length) return;
  await call("POST", `${BASE}/${root()}:commit`, { writes });
}

export { root };
