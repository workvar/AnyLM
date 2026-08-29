// Firestore REST writes, authenticated as the service account rather than a
// signed-in user (see google-auth.ts) — this is the one path allowed to
// bypass firestore.rules, because a webhook event doesn't arrive with any
// user's ID token attached to attribute it to.
import { firestoreAccessToken } from "./google-auth";
import { encodeFields, type FirestoreFields } from "./values";

function projectIdFrom(serviceAccountJson: string): string {
  return (JSON.parse(serviceAccountJson) as { project_id: string }).project_id;
}

/** Merge-write: only the given top-level fields are touched, matching
 *  app/src/main/data/client.ts's updateDoc semantics (and doubling as
 *  create-if-absent, which is what every handler here wants). */
export async function upsertDoc(
  serviceAccountJson: string,
  collection: string,
  id: string,
  fields: FirestoreFields
): Promise<void> {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const mask = Object.keys(fields)
    .map((k) => `updateMask.fieldPaths=${encodeURIComponent(k)}`)
    .join("&");

  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}?${mask}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ fields: encodeFields(fields) }),
  });
  if (!res.ok) {
    throw new Error(`Firestore write to ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  }
}

export async function deleteDoc(
  serviceAccountJson: string,
  collection: string,
  id: string
): Promise<void> {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  // 404 just means it was never synced (e.g. deleted before initial sync) — fine.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore delete of ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  }
}

export async function getDoc(
  serviceAccountJson: string,
  collection: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const token = await firestoreAccessToken(serviceAccountJson);
  const projectId = projectIdFrom(serviceAccountJson);
  const base = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents`;
  const res = await fetch(`${base}/${collection}/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore read of ${collection}/${id} failed (${res.status}): ${await res.text()}`);
  const doc = (await res.json()) as { fields?: Record<string, { stringValue?: string }> };
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(doc.fields || {})) out[k] = v.stringValue ?? v;
  return out;
}
