"use client";

import { getAuth } from "firebase/auth";
import type { DocumentData } from "firebase/firestore";
import { getFirebaseApp } from "./firebase/client";
import { decodeValues } from "./laravel-values";

type Constraint = { field?: string; operator?: string; value?: unknown; direction?: string; maximum?: number };
type DocumentRef = { type: "document"; path: string; id: string };
type QueryRef = { type: "query"; path: string; constraints: Constraint[] };
type Snapshot = { id: string; exists: () => boolean; data: () => DocumentData };
type QuerySnapshot = { docs: Snapshot[] };
type Reply = { documents: { path: string; data: DocumentData | null }[] };
const changeEvent = "comparacel-data-change";
const waiting = new Map<string, Promise<Reply>>();
export const getDatabase = () => ({});
export const collection = (_database: unknown, ...parts: string[]): QueryRef => ({ type: "query", path: parts.join("/"), constraints: [] });
export const doc = (_database: unknown, ...parts: string[]): DocumentRef => ({ type: "document", path: parts.join("/"), id: parts.at(-1)! });
export const where = (field: string, operator: string, value: unknown): Constraint => ({ field, operator, value });
export const orderBy = (field: string, direction = "asc"): Constraint => ({ field, direction });
export const limit = (maximum: number): Constraint => ({ maximum });
export const query = (reference: QueryRef, ...constraints: Constraint[]): QueryRef => ({ ...reference, constraints });
export const serverTimestamp = () => ({ __comparacel_server_timestamp: true });

async function send(body: unknown, authenticate: boolean): Promise<Reply> {
  const user = authenticate ? getAuth(getFirebaseApp()).currentUser : null;
  const token = user ? await user.getIdToken() : null;
  const response = await fetch("/api/data", {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const reply = await response.json();
  if (!response.ok) throw new Error(reply.error || "Não foi possível acessar seus dados. Tente novamente.");
  return reply;
}
const queued = new Map<string, { reference: DocumentRef; resolve: (reply: Reply) => void; reject: (error: unknown) => void }[]>();
let scheduled = false;
async function flushDocuments() {
  scheduled = false;
  const pending = [...queued.values()];
  queued.clear();
  for (let index = 0; index < pending.length; index += 100) {
    const chunk = pending.slice(index, index + 100);
    try {
      const reply = await send({ action: "readMany", references: chunk.map(group => group[0].reference) }, false);
      chunk.forEach((group, position) => group.forEach(item => item.resolve({ documents: [reply.documents[position]] })));
    } catch (error) { chunk.forEach(group => group.forEach(item => item.reject(error))); }
  }
}
function operation(action: string, reference: DocumentRef | QueryRef, data?: DocumentData): Promise<Reply> {
  if (action === "read" && reference.type === "document" && /^(reactionStats|profiles)\//.test(reference.path)) {
    return new Promise((resolve, reject) => {
      queued.set(reference.path, [...(queued.get(reference.path) ?? []), { reference, resolve, reject }]);
      if (!scheduled) { scheduled = true; queueMicrotask(() => { void flushDocuments(); }); }
    });
  }
  return send({ action, reference, data }, action !== "read" || reference.path.startsWith("users/"));
}
function snapshot(record: Reply["documents"][number]): Snapshot {
  return { id: record.path.split("/").at(-1)!, exists: () => record.data !== null, data: () => decodeValues(record.data) as DocumentData };
}
export async function getDoc(reference: DocumentRef) { return snapshot((await operation("read", reference)).documents[0]); }
export async function setDoc(reference: DocumentRef, data: DocumentData) { await operation("set", reference, data); window.dispatchEvent(new Event(changeEvent)); }
export async function deleteDoc(reference: DocumentRef) { await operation("delete", reference); window.dispatchEvent(new Event(changeEvent)); }
export async function addDoc(reference: QueryRef, data: DocumentData) {
  const document = doc(null, reference.path, crypto.randomUUID());
  await operation("create", document, data);
  window.dispatchEvent(new Event(changeEvent));
  return document;
}

export function onSnapshot(reference: DocumentRef, success: (value: Snapshot) => void, failure: (error: unknown) => void): () => void;
export function onSnapshot(reference: QueryRef, success: (value: QuerySnapshot) => void, failure: (error: unknown) => void): () => void;
export function onSnapshot(reference: DocumentRef | QueryRef, success: ((value: Snapshot) => void) | ((value: QuerySnapshot) => void), failure: (error: unknown) => void) {
  let active = true;
  let running = false;
  let repeat = false;
  const refresh = async () => {
    if (!active || document.visibilityState === "hidden") return;
    if (running) { repeat = true; return; }
    running = true;
    const key = JSON.stringify([getAuth(getFirebaseApp()).currentUser?.uid ?? null, reference]);
    let request = waiting.get(key);
    if (!request) { request = operation("read", reference); waiting.set(key, request); }
    try {
      const reply = await request;
      if (active) {
        if (reference.type === "document") (success as (value: Snapshot) => void)(snapshot(reply.documents[0]));
        else (success as (value: QuerySnapshot) => void)({ docs: reply.documents.map(snapshot) });
      }
    } catch (error) { if (active) failure(error); }
    finally {
      if (waiting.get(key) === request) waiting.delete(key);
      running = false;
      if (repeat) { repeat = false; void refresh(); }
    }
  };
  const tick = () => { void refresh(); };
  tick();
  const interval = window.setInterval(tick, 30000);
  window.addEventListener(changeEvent, tick);
  window.addEventListener("comparacel-metrics-change", tick);
  window.addEventListener("focus", tick);
  document.addEventListener("visibilitychange", tick);
  return () => {
    active = false;
    window.clearInterval(interval);
    window.removeEventListener(changeEvent, tick);
    window.removeEventListener("comparacel-metrics-change", tick);
    window.removeEventListener("focus", tick);
    document.removeEventListener("visibilitychange", tick);
  };
}
