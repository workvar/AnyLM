// A small, Admin-SDK-shaped wrapper over the REST transport.
//
// The point is that the service logic reads almost the same as it did when it
// ran on Cloud Functions: `col("members").doc(id).get()`,
// `query("usage").where(...).sum(...)`. Only this file knows about typed
// values and structured queries.
import { randomBytes } from "crypto";
import * as rest from "./client";
import { encodeFields, decodeFields, idFromName, encode, FsValue } from "./value";

export interface Snap<T = Record<string, any>> {
  id: string;
  exists: boolean;
  data(): T | null;
}

export type Row<T = Record<string, any>> = T & { id: string };

function toSnap<T>(doc: rest.RawDoc | null, fallbackId = ""): Snap<T> {
  if (!doc) return { id: fallbackId, exists: false, data: () => null };
  return {
    id: idFromName(doc.name),
    exists: true,
    data: () => decodeFields(doc.fields || {}) as T,
  };
}

function toRow<T>(doc: rest.RawDoc): Row<T> {
  return { id: idFromName(doc.name), ...(decodeFields(doc.fields || {}) as T) };
}

// --- documents --------------------------------------------------------------

class DocRef {
  constructor(public collection: string, public id: string) {}

  get path(): string {
    return rest.docPath(this.collection, this.id);
  }

  async get<T = Record<string, any>>(): Promise<Snap<T>> {
    return toSnap<T>(await rest.getDoc(this.path), this.id);
  }

  async exists(): Promise<boolean> {
    return (await this.get()).exists;
  }

  async set(data: Record<string, unknown>): Promise<void> {
    await rest.setDoc(this.path, encodeFields(data));
  }

  /**
   * Merge write. Firestore's REST PATCH with an updateMask only touches the
   * listed fields, which is the same semantics as `set(..., {merge:true})`
   * and works whether or not the document already exists.
   */
  async merge(data: Record<string, unknown>): Promise<void> {
    await rest.updateDoc(this.path, encodeFields(data));
  }

  async update(data: Record<string, unknown>): Promise<void> {
    await rest.updateDoc(this.path, encodeFields(data));
  }

  async delete(): Promise<void> {
    await rest.deleteDoc(this.path);
  }
}

class CollectionRef {
  constructor(public name: string) {}

  doc(id: string): DocRef {
    return new DocRef(this.name, id);
  }

  async add(data: Record<string, unknown>): Promise<string> {
    const doc = await rest.createDoc(this.name, encodeFields(data));
    return idFromName(doc.name);
  }
}

export function col(name: string): CollectionRef {
  return new CollectionRef(name);
}

// Firestore's own auto-id alphabet and length, so generated ids are
// indistinguishable from server-assigned ones.
const ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function autoId(): string {
  const bytes = randomBytes(20);
  let out = "";
  for (let i = 0; i < 20; i++) out += ID_CHARS[bytes[i] % ID_CHARS.length];
  return out;
}

/**
 * Create a document whose timestamp fields are set by the server clock.
 *
 * The rules require `createdAt == request.time` on usage, logs and audit
 * entries, precisely so a client cannot backdate its history. A plain write
 * cannot satisfy that, because the value would come from the caller. Field
 * transforms are the only way to ask Firestore to stamp it, and they are only
 * available through the commit endpoint, which needs the id up front.
 */
export async function addStamped(
  collection: string,
  data: Record<string, unknown>,
  stampFields: string[] = ["createdAt"]
): Promise<string> {
  const id = autoId();
  await rest.commit([
    {
      update: { name: rest.docPath(collection, id), fields: encodeFields(data) },
      updateTransforms: stampFields.map((fieldPath) => ({
        fieldPath,
        setToServerValue: "REQUEST_TIME",
      })),
      currentDocument: { exists: false },
    },
  ]);
  return id;
}

/** Read many documents of one collection by id, in a single round trip. */
export async function getMany<T = Record<string, any>>(
  collection: string,
  ids: string[]
): Promise<Map<string, T>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const docs = await rest.batchGet(unique.map((id) => rest.docPath(collection, id)));
  const out = new Map<string, T>();
  for (const d of docs) out.set(idFromName(d.name), decodeFields(d.fields || {}) as T);
  return out;
}

// --- queries ----------------------------------------------------------------

type Op = "==" | "!=" | "<" | "<=" | ">" | ">=" | "in" | "array-contains";

const OPS: Record<Op, string> = {
  "==": "EQUAL",
  "!=": "NOT_EQUAL",
  "<": "LESS_THAN",
  "<=": "LESS_THAN_OR_EQUAL",
  ">": "GREATER_THAN",
  ">=": "GREATER_THAN_OR_EQUAL",
  in: "IN",
  "array-contains": "ARRAY_CONTAINS",
};

class Query {
  private filters: unknown[] = [];
  private orders: unknown[] = [];
  private cap: number | null = null;

  constructor(private collection: string) {}

  where(field: string, op: Op, value: unknown): this {
    // Null comparisons are unary filters in Firestore, not field filters with
    // a null operand. Getting this wrong returns zero rows silently, which is
    // exactly the kind of bug that hides for weeks.
    if (value === null && (op === "==" || op === "!=")) {
      this.filters.push({
        unaryFilter: {
          field: { fieldPath: field },
          op: op === "==" ? "IS_NULL" : "IS_NOT_NULL",
        },
      });
      return this;
    }
    const operand: FsValue =
      op === "in"
        ? { arrayValue: { values: (value as unknown[]).map(encode) } }
        : encode(value);
    this.filters.push({
      fieldFilter: { field: { fieldPath: field }, op: OPS[op], value: operand },
    });
    return this;
  }

  orderBy(field: string, dir: "asc" | "desc" = "asc"): this {
    this.orders.push({
      field: { fieldPath: field },
      direction: dir === "desc" ? "DESCENDING" : "ASCENDING",
    });
    return this;
  }

  limit(n: number): this {
    this.cap = n;
    return this;
  }

  build(): Record<string, unknown> {
    const q: Record<string, unknown> = { from: [{ collectionId: this.collection }] };
    if (this.filters.length === 1) q.where = this.filters[0];
    else if (this.filters.length > 1) {
      q.where = { compositeFilter: { op: "AND", filters: this.filters } };
    }
    if (this.orders.length) q.orderBy = this.orders;
    if (this.cap != null) q.limit = this.cap;
    return q;
  }

  async get<T = Record<string, any>>(): Promise<Row<T>[]> {
    const docs = await rest.runQuery(this.build());
    return docs.map((d) => toRow<T>(d));
  }

  async first<T = Record<string, any>>(): Promise<Row<T> | null> {
    const rows = await this.limit(1).get<T>();
    return rows[0] || null;
  }

  /** Server-side sum. Returns 0 when nothing matched. */
  async sum(field: string): Promise<number> {
    const res = await rest.runAggregation(this.build(), [
      { alias: "total", sum: { field: { fieldPath: field } } },
    ]);
    const v = res.total as Record<string, unknown> | undefined;
    if (!v) return 0;
    return Number(v.integerValue ?? v.doubleValue ?? 0) || 0;
  }

  /** Server-side count. */
  async count(): Promise<number> {
    const res = await rest.runAggregation(this.build(), [{ alias: "n", count: {} }]);
    const v = res.n as Record<string, unknown> | undefined;
    return v ? Number(v.integerValue ?? 0) || 0 : 0;
  }
}

export function query(collection: string): Query {
  return new Query(collection);
}

/**
 * Delete every document a query matches, in batches.
 *
 * Firestore has no cascading delete, so removing an org means sweeping each
 * collection that referenced it by hand.
 */
export async function deleteWhere(collection: string, field: string, value: unknown): Promise<void> {
  for (;;) {
    const rows = await query(collection).where(field, "==", value).limit(300).get();
    if (!rows.length) return;
    await rest.commit(rows.map((r) => ({ delete: rest.docPath(collection, r.id) })));
    if (rows.length < 300) return;
  }
}

/** Apply the same field patch to many documents at once. */
export async function updateMany(
  collection: string,
  ids: string[],
  data: Record<string, unknown>
): Promise<void> {
  if (!ids.length) return;
  const fields = encodeFields(data);
  await rest.commit(
    ids.map((id) => ({
      update: { name: rest.docPath(collection, id), fields },
      updateMask: { fieldPaths: Object.keys(fields) },
    }))
  );
}

export { rest };
