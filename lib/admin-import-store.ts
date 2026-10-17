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
  const products = await db.collection("products").select("name", "categorySlug", "offers").get();
  const bySource = products.docs.find(doc => (doc.data().offers ?? []).some((offer: { external_id?: string; url?: string }) => offer.external_id === collected.externalId || (source === "amazon" && offer.url?.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() === collected.externalId)));
  const byName = products.docs.filter(doc => doc.data().categorySlug === category && slugify(doc.data().name ?? "") === slugify(collected.name));
  const match = bySource ?? (byName.length === 1 ? byName[0] : undefined);
  if (!match) return null;
  // Persistence needs the complete current revision, including manual editorial fields.
  const product = await db.doc(`products/${match.id}`).get();
  return product.exists ? adminProductFromData(product.id, product.data()!) : null;
}
export type ExtensionUpdateMode = "import" | "price" | "full" | "offer" | "unavailable";
export function mergeImportedProduct(collected: CollectedProduct, existing: AdminProduct | null, category: string, brandId: string, storeId: string, imageUrl: string, mode: ExtensionUpdateMode = "import"): AdminProduct {
  // An announcement is an offer; a marketplace can have many announcements.
  const previousOffer = existing?.offers.find(offer => offer.storeId === storeId && (
    offer.externalId === collected.externalId || offer.url === collected.buyUrl ||
    (/^SHP/.test(collected.externalId) && (()=>{try{const url=new URL(offer.url);const match=url.pathname.match(/^\/product\/(\d+)\/(\d+)(?:\/|$)/) ?? url.pathname.match(/-i\.(\d+)\.(\d+)(?:\/|$)/);return ["shopee.com.br","www.shopee.com.br"].includes(url.hostname) && match && `SHP${match[1]}-${match[2]}`===collected.externalId;}catch{return false;}})()) ||
    offer.url.match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/i)?.[1].toUpperCase() === collected.externalId ||
    (collected.externalId.startsWith("item-") ? /^https?:\/\/produto\./.test(offer.url) : !/^https?:\/\/produto\./.test(offer.url)) && offer.url.replaceAll("-", "").match(/MLB\d+/i)?.[0].toUpperCase() === collected.externalId.replace(/^item-/, "")
  ));
  if ((mode === "price" || mode === "unavailable") && !previousOffer) throw new AdminError("Este anúncio ainda não está vinculado. Use Adicionar oferta e informe o link de afiliado.");
  const offerId = previousOffer?.id ?? `offer-${storeId}-${collected.externalId}`;
  if(mode === "unavailable") {
    const previous=previousOffer;
    if(!existing || !previous)throw new AdminError("Este anúncio precisa estar vinculado ao produto.");
    return {...existing,offers:existing.offers.map(offer=>offer.id===offerId?{...offer,externalId:collected.externalId,available:false}:offer)};
  }
  if (existing && (mode === "price" || mode === "offer")) {
    const previous = previousOffer;
    const offer = mode === "price" && previous ? {...previous, externalId: collected.externalId, price: collected.price, available:true} : {id: offerId, storeId, externalId: collected.externalId, price: collected.price, url: collected.buyUrl, available: true};
    return {...existing, offers: [...existing.offers.filter(offer => offer.id !== offerId), offer]};
  }
  const specs = [...(existing?.specs ?? [])];
  for (const spec of collected.specs) if (!specs.some(item => item.group === spec.group && item.slug === spec.slug) && specs.length < 200) specs.push({ ...spec, order: specs.length });
  if (mode === "full") for (const spec of collected.specs) {
    const index = specs.findIndex(item => item.group === spec.group && item.slug === spec.slug);
    if (index >= 0) specs[index] = {...spec, order: specs[index].order, higherIsBetter: specs[index].higherIsBetter};
  }
  const offer = { id: offerId, externalId: collected.externalId, storeId, price: collected.price ?? previousOffer?.price ?? null, url: collected.buyUrl, available: true };
  const refreshed = mode === "full" ? {name: collected.name, description: collected.description || existing?.description || "", brandId, imageUrl: imageUrl || existing?.imageUrl || ""} : {};
  return { id: existing?.id ?? `${slugify(collected.name).slice(0, 180).replace(/-$/, "")}-${collected.externalId.toLowerCase()}`, revision: existing?.revision ?? 0, name: existing?.name ?? collected.name, description: existing?.description || collected.description, brandId: existing?.brandId || brandId, category: existing?.category ?? category, imageUrl: existing?.imageUrl || imageUrl, isActive: existing?.isActive ?? false, overallScore: existing?.overallScore ?? 0, metaTitle: existing?.metaTitle ?? "", metaDescription: existing?.metaDescription ?? "", specs, offers: [...(existing?.offers.filter(item => item.id !== offerId) ?? []), offer], highlights: existing?.highlights.length ? existing.highlights : collected.highlights ?? [], ...refreshed };
}
export async function persistImportedProduct(db: Firestore, actor: { uid: string; email?: string }, source: ImportSource, collected: CollectedProduct, existing: AdminProduct | null, category: string, imageUrl: string, mode: ExtensionUpdateMode = "import", targetStoreId?: string) {
  if (targetStoreId && (!["price", "unavailable"].includes(mode) || !existing?.offers.some(offer => offer.storeId === targetStoreId))) throw new AdminError("Oferta do lote inválida.");
  const brandId = (mode !== "full" && existing?.brandId) || await ensureImportReference(db, actor, "brands", collected.brand);
  const storeId = targetStoreId ?? await ensureImportReference(db, actor, "stores", source === "shopee" ? "Shopee" : source === "amazon" ? "Amazon" : "Mercado Livre");
  const input = mergeImportedProduct(collected, existing, category, brandId, storeId, imageUrl, mode);
  const product = await saveAdminProduct(db, actor, input, !existing, Date.now(), { key: `${source}-${collected.externalId}`, externalId: collected.externalId, storeId, offerId: input.offers.find(offer => offer.storeId === storeId && offer.externalId === collected.externalId)!.id, priceCondition:collected.priceCondition ?? "standard" });
  return { product, created: !existing };
}
