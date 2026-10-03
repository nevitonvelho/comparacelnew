import type { Firestore } from "firebase-admin/firestore";
import { AdminError, slugify, type AdminProduct } from "./admin-model";
import { adminProductFromData, createAdminReference, saveAdminProduct } from "./admin-store";
import type { CollectedProduct, ImportSource } from "./admin-import-model";
export async function ensureImportReference(db: Firestore, actor: { uid: string; email?: string }, kind: "brands" | "stores", name: string) {
  const slug = slugify(name).slice(0, 140).replace(/-$/, "");
  if (!slug) throw new AdminError("A fonte não informou uma marca válida.");
  const matches = await db.collection(kind).where("slug", "==", slug).limit(1).get();
  if (!matches.empty) return matches.docs[0].id;
  try { return (await createAdminReference(db, actor, { kind, name, slug, website: "" })).id; }
  catch (error) { if (!(error instanceof AdminError) || error.status !== 409) throw error; const retry = await db.collection(kind).where("slug", "==", slug).limit(1).get(); if (!retry.empty) return retry.docs[0].id; throw error; }
}
export async function findImportProduct(db: Firestore, source: ImportSource, collected: CollectedProduct, category: string): Promise<AdminProduct | null> {
  const mapping = await db.doc(`adminImportSources/${source}-${collected.externalId}`).get();
  if (mapping.exists) { const product = await db.doc(`products/${mapping.data()!.productId}`).get(); if (product.exists) return adminProductFromData(product.id, product.data()!); }
  // Match migrated records by the source ID first; title matching is only a fallback.
  const products = await db.collection("products").get();
  const bySource = products.docs.find(doc => (doc.data().offers ?? []).some((offer: { external_id?: string; url?: string }) => offer.external_id === collected.externalId || (source === "amazon" && offer.url?.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() === collected.externalId)));
  const byName = products.docs.filter(doc => doc.data().categorySlug === category && slugify(doc.data().name ?? "") === slugify(collected.name));
  const match = bySource ?? (byName.length === 1 ? byName[0] : undefined);
  return match ? adminProductFromData(match.id, match.data()) : null;
}
export function mergeImportedProduct(collected: CollectedProduct, existing: AdminProduct | null, category: string, brandId: string, storeId: string, imageUrl: string): AdminProduct {
  const specs = [...(existing?.specs ?? [])];
  for (const spec of collected.specs) if (!specs.some(item => item.group === spec.group && item.slug === spec.slug) && specs.length < 200) specs.push({ ...spec, order: specs.length });
  const previousOffer = existing?.offers.find(offer => offer.storeId === storeId);
  const offer = { id: `store-${storeId}`, storeId, price: collected.price ?? previousOffer?.price ?? null, url: collected.buyUrl, available: true };
  return { id: existing?.id ?? `${slugify(collected.name).slice(0, 180).replace(/-$/, "")}-${collected.externalId.toLowerCase()}`, revision: existing?.revision ?? 0, name: existing?.name ?? collected.name, description: existing?.description || collected.description, brandId: existing?.brandId || brandId, category: existing?.category ?? category, imageUrl: existing?.imageUrl || imageUrl, isActive: existing?.isActive ?? false, overallScore: existing?.overallScore ?? 0, metaTitle: existing?.metaTitle ?? "", metaDescription: existing?.metaDescription ?? "", specs, offers: [...(existing?.offers.filter(item => item.storeId !== storeId) ?? []), offer], highlights: existing?.highlights ?? [] };
}
export async function persistImportedProduct(db: Firestore, actor: { uid: string; email?: string }, source: ImportSource, collected: CollectedProduct, existing: AdminProduct | null, category: string, imageUrl: string) {
  const brandId = existing?.brandId || await ensureImportReference(db, actor, "brands", collected.brand);
  const storeId = await ensureImportReference(db, actor, "stores", source === "amazon" ? "Amazon" : "Mercado Livre");
  const input = mergeImportedProduct(collected, existing, category, brandId, storeId, imageUrl);
  const product = await saveAdminProduct(db, actor, input, !existing, Date.now(), { key: `${source}-${collected.externalId}`, externalId: collected.externalId, storeId });
  return { product, created: !existing };
}
