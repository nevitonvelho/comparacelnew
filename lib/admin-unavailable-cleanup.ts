import { Timestamp, type Firestore } from "firebase-admin/firestore";

const UNAVAILABLE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000;

function millis(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  const stamp = value as { toMillis?: () => number; toDate?: () => Date; seconds?: number; _seconds?: number } | null;
  if (typeof stamp?.toMillis === "function") return stamp.toMillis();
  if (typeof stamp?.toDate === "function") return stamp.toDate().getTime();
  const seconds = stamp?.seconds ?? stamp?._seconds;
  return typeof seconds === "number" ? seconds * 1000 : NaN;
}

// Used for existing records as well as offers already marked unavailable.
export function reconcileUnavailableOffers(data: Record<string, unknown>, now: number) {
  const offers = Array.isArray(data.offers) ? data.offers as Record<string, unknown>[] : [];
  let changed = false;
  let removed = 0;
  const retained = offers.flatMap(offer => {
    const valid = offer.is_available === true && typeof offer.url === "string" && !!offer.url.trim()
      && typeof offer.priceCents === "number" && Number.isFinite(offer.priceCents) && offer.priceCents > 0;
    if (valid) return [offer];
    const since = millis(offer.unavailableSince);
    if (Number.isFinite(since) && since <= now - UNAVAILABLE_RETENTION_MS) {
      changed = true;
      removed++;
      return [];
    }
    if (offer.is_available !== false || !Number.isFinite(since)) {
      changed = true;
      return [{...offer, is_available: false, unavailableSince: Timestamp.fromMillis(now)}];
    }
    return [offer];
  });
  const prices = retained.filter(offer => offer.is_available === true).map(offer => Number(offer.priceCents));
  const active = data.isActive === true && prices.length > 0;
  const bestPriceCents = prices.length ? Math.min(...prices) : null;
  changed ||= data.isActive !== active || data.is_active !== active || data.bestPriceCents !== bestPriceCents;
  return {changed, removed, offers: retained, isActive: active, is_active: active, bestPriceCents};
}

export async function removeExpiredUnavailableOffers(db: Firestore, now = Date.now()) {
  const snapshot = await db.collection("products").select("offers", "isActive", "is_active", "bestPriceCents").get();
  let removed = 0;
  let productsChanged = 0;
  for (const document of snapshot.docs) {
    if (!reconcileUnavailableOffers(document.data(), now).changed) continue;
    const ref = db.collection("products").doc(document.id);
    const audit = db.collection("adminAudit").doc();
    const result = await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists) return null;
      const data = current.data()!;
      const {changed, removed: deletedCount, ...patch} = reconcileUnavailableOffers(data, now);
      if (!changed) return null;
      tx.update(ref, {
        ...patch,
        adminRevision: (Number(data.adminRevision) || 0) + 1,
        updatedAt: Timestamp.fromMillis(now),
        updated_at: new Date(now).toISOString(),
      });
      tx.create(audit, {
        action: "offer.unavailable-cleanup",
        productId: document.id,
        name: String(data.name ?? document.id),
        removedOffers: deletedCount,
        beforeActive: data.isActive === true,
        afterActive: patch.isActive,
        createdAt: Timestamp.fromMillis(now),
      });
      return {removed: deletedCount};
    });
    if (result) {
      removed += result.removed;
      productsChanged++;
    }
  }
  return {removed, productsChanged};
}
