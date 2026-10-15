import "server-only";
import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { BackendError, backendRequest } from "./laravel-api";
import { decodeValues, encodeValues } from "./laravel-values";

type Data = Record<string, unknown>;
type WireDocument = { path: string; data: Data | null; version: string | null };
type QuerySpec = { collection: string; group?: boolean; filters: { field: string; operator: string; value: unknown }[]; order: { field: string; direction: string }[]; limit?: number; after?: unknown; fields?: string[] };
type Check = { path: string; version: string | null } | { query: QuerySpec; version: string };
type Write = { path: string; operation: string; data?: unknown; merge?: boolean };

async function mapImages(documents: WireDocument[]) {
  const names = new Map<string, string>();
  for (const document of documents) {
    const value = document.data?.imageUrl;
    if (typeof value !== "string") continue;
    const match = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/comparacel\.firebasestorage\.app\/o\/([^?]+)/.exec(value);
    if (match) { try { names.set(document.path, decodeURIComponent(match[1])); } catch {} }
  }
  const unique = [...new Set(names.values())];
  const images: Record<string, string> = {};
  for (let index = 0; index < unique.length; index += 200) Object.assign(images, (await backendRequest<{ images: Record<string, string> }>("images", { names: unique.slice(index, index + 200) })).images);
  for (const document of documents) {
    const name = names.get(document.path);
    if (name && document.data) document.data.imageUrl = images[name] ?? null;
  }
  return documents;
}

function documentPath(path: string) {
  const parts = path.split("/");
  if (parts.length % 2 !== 0 || parts.some(part => !part || part === "." || part === "..")) throw new Error("Invalid document path");
  return path;
}

class DocumentSnapshot {
  readonly id: string;
  readonly exists: boolean;
  readonly ref: DocumentReference;
  constructor(private wire: WireDocument) {
    this.ref = new DocumentReference(wire.path);
    this.id = this.ref.id;
    this.exists = wire.data !== null;
  }
  data() { return this.exists ? decodeValues(this.wire.data) as Data : undefined; }
  get(field: string) { return this.data()?.[field]; }
}

class DocumentReference {
  readonly id: string;
  constructor(readonly path: string) { documentPath(path); this.id = path.split("/").at(-1)!; }
  get parent(): CollectionReference { return new CollectionReference(this.path.split("/").slice(0, -1).join("/")); }
  collection(name: string) { return new CollectionReference(`${this.path}/${name}`); }
  async get() { return (await readDocuments([this]))[0]; }
  async set(data: Data, options?: { merge?: boolean }) { await commit([{ path: this.path, operation: "set", data: encodeValues(data), merge: options?.merge }]); }
  async update(data: Data) { await commit([{ path: this.path, operation: "update", data: encodeValues(data) }]); }
  async create(data: Data) { await commit([{ path: this.path, operation: "create", data: encodeValues(data) }]); }
  async delete() { await commit([{ path: this.path, operation: "delete" }]); }
}

class QuerySnapshot {
  readonly docs: DocumentSnapshot[];
  readonly size: number;
  readonly empty: boolean;
  constructor(documents: WireDocument[]) { this.docs = documents.map(document => new DocumentSnapshot(document)); this.size = this.docs.length; this.empty = this.size === 0; }
  forEach(callback: (document: DocumentSnapshot) => void) { this.docs.forEach(callback); }
}

class Query {
  constructor(readonly spec: QuerySpec) {}
  where(field: string, operator: string, value: unknown) { return new Query({ ...this.spec, filters: [...this.spec.filters, { field, operator, value: encodeValues(value) }] }); }
  orderBy(field: string | { toString(): string }, direction = "asc") { return new Query({ ...this.spec, order: [...this.spec.order, { field: String(field), direction }] }); }
  limit(limit: number) { return new Query({ ...this.spec, limit }); }
  startAfter(after: unknown) { return new Query({ ...this.spec, after: encodeValues(after) }); }
  select(...fields: string[]) { return new Query({ ...this.spec, fields }); }
  async get() { return new QuerySnapshot(await mapImages((await backendRequest<{ documents: WireDocument[] }>("query", this.spec)).documents)); }
  count() { return { get: async () => { const reply = await backendRequest<{ count: number }>("count", this.spec); return { data: () => reply }; } }; }
}

class CollectionReference extends Query {
  readonly id: string;
  constructor(readonly path: string) { super({ collection: path, filters: [], order: [] }); this.id = path.split("/").at(-1)!; }
  get parent(): DocumentReference | null { const path = this.path.split("/").slice(0, -1).join("/"); return path ? new DocumentReference(path) : null; }
  doc(id = randomUUID()) { return new DocumentReference(`${this.path}/${id}`); }
  async add(data: Data) { const reference = this.doc(); await reference.create(data); return reference; }
}

type ReadOptions = { fieldMask?: string[] };
async function readDocuments(references: DocumentReference[], options?: ReadOptions, checks?: Check[]) {
  if (!references.length) return [];
  const reply = await backendRequest<{ documents: WireDocument[] }>("get", { paths: references.map(reference => reference.path), fields: options?.fieldMask });
  if (checks) checks.push(...reply.documents.map(document => ({ path: document.path, version: document.version })));
  return (await mapImages(reply.documents)).map(document => new DocumentSnapshot(document));
}

async function commit(writes: Write[], checks: Check[] = []) {
  if (writes.length) await backendRequest("commit", { writes, checks });
}

class WriteBatch {
  protected writes: Write[] = [];
  set(reference: DocumentReference, data: Data, options?: { merge?: boolean }) { this.writes.push({ path: reference.path, operation: "set", data: encodeValues(data), merge: options?.merge }); return this; }
  update(reference: DocumentReference, data: Data) { this.writes.push({ path: reference.path, operation: "update", data: encodeValues(data) }); return this; }
  create(reference: DocumentReference, data: Data) { this.writes.push({ path: reference.path, operation: "create", data: encodeValues(data) }); return this; }
  delete(reference: DocumentReference) { this.writes.push({ path: reference.path, operation: "delete" }); return this; }
  async commit() { await commit(this.writes); }
}

class Transaction extends WriteBatch {
  private checks: Check[] = [];
  async get(reference: DocumentReference | Query) {
    if (reference instanceof DocumentReference) return (await readDocuments([reference], undefined, this.checks))[0];
    const reply = await backendRequest<{ documents: WireDocument[]; version: string }>("query", reference.spec);
    this.checks.push({ query: reference.spec, version: reply.version });
    return new QuerySnapshot(await mapImages(reply.documents));
  }
  async getAll(...args: (DocumentReference | ReadOptions)[]) {
    return readDocuments(args.filter((argument): argument is DocumentReference => argument instanceof DocumentReference), args.find(argument => !(argument instanceof DocumentReference)) as ReadOptions | undefined, this.checks);
  }
  async commit() { await commit(this.writes, this.checks); }
}

class LaravelDatabase {
  doc(path: string) { return new DocumentReference(path); }
  collection(path: string) { return new CollectionReference(path); }
  collectionGroup(name: string) { return new Query({ collection: name, group: true, filters: [], order: [] }); }
  batch() { return new WriteBatch(); }
  getAll(...args: (DocumentReference | ReadOptions)[]) { return readDocuments(args.filter((argument): argument is DocumentReference => argument instanceof DocumentReference), args.find(argument => !(argument instanceof DocumentReference)) as ReadOptions | undefined); }
  async runTransaction<T>(callback: (transaction: Transaction) => Promise<T>) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const transaction = new Transaction();
      const result = await callback(transaction);
      try { await transaction.commit(); return result; }
      catch (error) {
        if (!(error instanceof BackendError) || error.status !== 409 || attempt === 4) throw error;
        await new Promise(resolve => setTimeout(resolve, 20 * (attempt + 1)));
      }
    }
    throw new Error("Transaction retry limit reached");
  }
}

// Preserve the existing domain services while replacing their persistence boundary.
// Firebase Admin is retained for Google identity verification only.
const database = new LaravelDatabase();
export function getLaravelDatabase(): Firestore { return database as unknown as Firestore; }
