import { createHash } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import type { ImportEntry } from "./admin-import-model";

export const MERCADO_PRICE_CACHE_MS = 24 * 60 * 60 * 1000;

export function mercadoPriceCacheKey(entry: ImportEntry, source: string) {
  return createHash("sha256").update(JSON.stringify([
    1, source, entry.kind ?? "catalog", entry.externalId, entry.buyUrl,
  ])).digest("hex");
}

export function validMercadoPriceCache(value: Record<string, unknown> | undefined, now = Date.now()) {
  if (!value || typeof value.checkedAt !== "number" || value.checkedAt > now
    || now - value.checkedAt >= MERCADO_PRICE_CACHE_MS
    || typeof value.price !== "number" || !Number.isFinite(value.price) || value.price <= 0
    || !["pix", "standard"].includes(String(value.condition))) return null;
  return { price: value.price, checkedAt: value.checkedAt, expiresAt: value.checkedAt + MERCADO_PRICE_CACHE_MS };
}

export async function readMercadoPriceCache(db: Firestore, entry: ImportEntry, source: string) {
  return validMercadoPriceCache((await db.doc(`adminMercadoPriceCache/${mercadoPriceCacheKey(entry, source)}`).get()).data());
}

export async function writeMercadoPriceCache(db: Firestore, entry: ImportEntry, source: string, price: number, condition: "pix" | "standard", checkedAt: number) {
  await db.doc(`adminMercadoPriceCache/${mercadoPriceCacheKey(entry, source)}`).set({ price, condition, checkedAt });
}
