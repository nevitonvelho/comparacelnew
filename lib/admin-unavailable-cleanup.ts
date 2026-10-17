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

export async function removeExpiredUnavailableOffers(db: Firestore, now = Date.now()) {
  const cutoff = now - UNAVAILABLE_RETENTION_MS;
  const snapshot = await db.collection("products").select("offers").get();
  let removed = 0;
  let productsChanged = 0;

  for (const document of snapshot.docs) {
    const offers = Array.isArray(document.data().offers) ? document.data().offers as Record<string, unknown>[] : [];
    if (!offers.some(offer => offer.is_available === false && millis(offer.unavailableSince) <= cutoff)) continue;

    const ref = db.collection("products").doc(document.id);
    const audit = db.collection("adminAudit").doc();
    const result = await db.runTransaction(async tx => {
      const current = await tx.get(ref);
      if (!current.exists) return 0;
      const data = current.data()!;
      const currentOffers = Array.isArray(data.offers) ? data.offers as Record<string, unknown>[] : [];
      const retained = currentOffers.filter(offer => !(offer.is_available === false && millis(offer.unavailableSince) <= cutoff));
      const deletedCount = currentOffers.length - retained.length;
      if (!deletedCount) return 0;
      const prices = retained.filter(offer => offer.is_available === true && typeof offer.priceCents === "number").map(offer => Number(offer.priceCents));
      const date = new Date(now).toISOString();
      tx.update(ref, {
        offers: retained,
        bestPriceCents: prices.length ? Math.min(...prices) : null,
        adminRevision: (Number(data.adminRevision) || 0) + 1,
        updatedAt: Timestamp.fromMillis(now),
        updated_at: date,
      });
      tx.create(audit, {
        action: "offer.unavailable-expired",
        productId: document.id,
        name: String(data.name ?? document.id),
        removedOffers: deletedCount,
        createdAt: Timestamp.fromMillis(now),
      });
      return deletedCount;
    });
    if (result) {
      removed += result;
      productsChanged++;
    }
  }

  return { removed, productsChanged };
}
