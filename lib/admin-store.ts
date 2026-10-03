import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { categoryNames } from "./product-model";
import { AdminError, validateAdminProduct, validateReference, type AdminProduct, type AdminSpec } from "./admin-model";
function string(value: unknown) { return typeof value === "string" ? value : ""; }
export function adminProductFromData(id: string, data: Record<string, unknown>): AdminProduct {
  const specs = (Array.isArray(data.specs) ? data.specs : []).map((spec: Record<string, unknown>, index) => {
    const type: AdminSpec["type"] = ["number", "bool"].includes(String(spec.type)) ? spec.type as "number" | "bool" : "text";
    return { slug: string(spec.keySlug), name: string(spec.name), group: string(spec.group) || "Especificações", type, value: type === "number" ? spec.value_number == null ? "" : String(spec.value_number) : type === "bool" ? spec.value_bool == null ? "" : String(spec.value_bool) : string(spec.value_text) || string(spec.display), unit: string(spec.unit), higherIsBetter: typeof spec.higherIsBetter === "boolean" ? spec.higherIsBetter : null, order: Number(spec.order) || index };
  });
  return { id, revision: Number(data.adminRevision) || 0, name: string(data.name), description: string(data.description), brandId: String(data.brandId ?? data.brand ?? ""), category: string(data.categorySlug), imageUrl: string(data.imageUrl), isActive: data.isActive === true, overallScore: Number(data.overallScore) || 0, metaTitle: string(data.meta_title), metaDescription: string(data.meta_description), specs, offers: (Array.isArray(data.offers) ? data.offers : []).map((offer: Record<string, unknown>) => ({ id: String(offer.id), storeId: String(offer.storeId ?? offer.store ?? ""), price: offer.priceCents == null ? null : Number(offer.priceCents) / 100, url: string(offer.url), available: offer.is_available === true })), highlights: (Array.isArray(data.highlights) ? data.highlights : []).filter((item: Record<string, unknown>) => item.kind === "pro" || item.kind === "con").map((item: Record<string, unknown>) => ({ kind: item.kind as "pro" | "con", text: string(item.text) })) };
}
function specDocument(spec: AdminSpec) {
  const number = spec.type === "number" && spec.value ? Number(spec.value) : null;
  const valueBool = spec.type === "bool" && spec.value ? spec.value === "true" : null;
  const display = spec.type === "bool" ? valueBool === null ? "—" : valueBool ? "Sim" : "Não" : spec.type === "number" ? number === null ? "—" : `${number.toLocaleString("pt-BR", { maximumFractionDigits: 12 })}${spec.unit ? ` ${spec.unit}` : ""}` : spec.value || "—";
  return { keySlug: spec.slug, name: spec.name, group: spec.group, type: spec.type, unit: spec.unit, order: spec.order, higherIsBetter: spec.higherIsBetter, value_number: number, value_text: spec.type === "text" ? spec.value : "", value_bool: valueBool, display };
}
export async function saveAdminProduct(db: Firestore, actor: { uid: string; email?: string }, value: unknown, creating: boolean, now = Date.now(), importSource?: { key: string; externalId: string; storeId: string }) {
  const input = validateAdminProduct(value);
  if (!Object.hasOwn(categoryNames, input.category)) throw new AdminError("Escolha uma categoria cadastrada.");
  const ref = db.collection("products").doc(input.id);
  const audit = db.collection("adminAudit").doc();
  return db.runTransaction(async tx => {
    const source = importSource ? db.collection("adminImportSources").doc(importSource.key) : null;
    const sourceDoc = source ? await tx.get(source) : null;
    if (sourceDoc?.exists && sourceDoc.data()?.productId !== input.id) throw new AdminError("Este produto já foi importado em outra ficha. Atualize a lista e tente novamente.", 409);
    const existing = await tx.get(ref);
    if (creating && existing.exists) throw new AdminError("Já existe um produto com esta URL.", 409);
    if (!creating && !existing.exists) throw new AdminError("Produto não encontrado.", 404);
    const old = existing.data() ?? {};
    if (input.revision !== (Number(old.adminRevision) || 0)) throw new AdminError("O produto foi alterado em outra aba. Reabra a ficha antes de salvar.", 409);
    const categories = await tx.get(db.collection("categories").where("slug", "==", input.category).limit(1));
    if (categories.empty) throw new AdminError("Categoria não encontrada.");
    const references = await tx.getAll(db.collection("brands").doc(input.brandId), ...input.offers.map(offer => db.collection("stores").doc(offer.storeId)));
    if (!references[0].exists) throw new AdminError("Marca não encontrada.");
    const offers = input.offers.map((offer, index) => {
      const store = references[index + 1];
      if (!store.exists) throw new AdminError("Uma das lojas não está cadastrada.");
      const previous = (Array.isArray(old.offers) ? old.offers : []).find((item: Record<string, unknown>) => String(item.storeId ?? item.store) === offer.storeId);
      return { ...previous, ...(importSource?.storeId === offer.storeId ? { external_id: importSource.externalId } : {}), id: previous?.id ?? offer.id, storeId: offer.storeId, store: store.data()!.legacyId ?? store.id, storeName: string(store.data()!.name), url: offer.url, priceCents: offer.price === null ? null : Math.round(offer.price * 100), price: offer.price, is_available: offer.available, currency: "BRL" };
    });
    const prices = offers.filter(offer => offer.is_available && offer.priceCents !== null).map(offer => offer.priceCents!);
    const date = new Date(now).toISOString();
    const patch = { name: input.name, slug: input.id, description: input.description, brandId: input.brandId, brand: references[0].data()!.legacyId ?? input.brandId, brandName: string(references[0].data()!.name), categorySlug: input.category, category: categories.docs[0].data().legacyId ?? categories.docs[0].id, isActive: input.isActive, is_active: input.isActive, imageUrl: input.imageUrl || null, overallScore: input.overallScore, overall_score: String(input.overallScore), meta_title: input.metaTitle, meta_description: input.metaDescription, specs: input.specs.map(spec => ({ ...(Array.isArray(old.specs) ? old.specs : []).find((item: Record<string, unknown>) => item.group === spec.group && item.keySlug === spec.slug), ...specDocument(spec) })), offers, highlights: input.highlights.map(item => ({ ...(Array.isArray(old.highlights) ? old.highlights : []).find((previous: Record<string, unknown>) => previous.kind === item.kind && previous.text === item.text), ...item })), bestPriceCents: prices.length ? Math.min(...prices) : null, label: input.highlights.find(item => item.kind === "pro")?.text ?? "Ficha técnica", adminRevision: input.revision + 1, updated_at: date, updatedAt: Timestamp.fromMillis(now), ...(creating ? { created_at: date } : {}) };
    if (creating) tx.create(ref, patch); else tx.set(ref, patch, { merge: true });
    if (source && importSource) tx.set(source, { productId: input.id, externalId: importSource.externalId, updatedAt: Timestamp.fromMillis(now) });
    for (const offer of offers) {
      const previous = (Array.isArray(old.offers) ? old.offers : []).find((item: Record<string, unknown>) => String(item.storeId ?? item.store) === offer.storeId);
      if (offer.is_available && offer.priceCents !== null && (previous?.priceCents !== offer.priceCents)) tx.create(db.collection("priceHistory").doc(), { productSlug: input.id, storeId: offer.storeId, store: offer.store, priceCents: offer.priceCents, price: offer.price, recorded_at: date, source: "admin" });
    }
    tx.create(audit, { action: importSource ? "product.import" : creating ? "product.create" : "product.update", productId: input.id, name: input.name, actorUid: actor.uid, actorEmail: actor.email ?? "", createdAt: Timestamp.fromMillis(now), beforeActive: creating ? null : old.isActive === true, afterActive: input.isActive });
    return adminProductFromData(input.id, { ...old, ...patch });
  });
}
export async function createAdminReference(db: Firestore, actor: { uid: string; email?: string }, value: unknown, now = Date.now()) {
  const input = validateReference(value);
  const ref = db.collection(input.kind).doc(input.slug);
  const audit = db.collection("adminAudit").doc();
  return db.runTransaction(async tx => {
    const existing = await tx.get(db.collection(input.kind).where("slug", "==", input.slug).limit(1));
    const exact = await tx.get(ref);
    if (!existing.empty || exact.exists) throw new AdminError("Este identificador já está cadastrado.", 409);
    tx.create(ref, { name: input.name, slug: input.slug, website: input.website, created_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() });
    tx.create(audit, { action: `${input.kind}.create`, name: input.name, actorUid: actor.uid, actorEmail: actor.email ?? "", createdAt: Timestamp.fromMillis(now) });
    return { id: ref.id, name: input.name, slug: input.slug, website: input.website };
  });
}
export async function readAdminCatalog(db: Firestore) {
  const [products, brands, stores] = await Promise.all([db.collection("products").get(), db.collection("brands").get(), db.collection("stores").get()]);
  const references = (docs: typeof brands.docs) => docs.map(doc => ({ id: doc.id, name: string(doc.data().name), slug: string(doc.data().slug), website: string(doc.data().website) })).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  return { products: products.docs.map(doc => adminProductFromData(doc.id, doc.data())).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), brands: references(brands.docs), stores: references(stores.docs), categories: Object.entries(categoryNames).map(([id, name]) => ({ id, name })) };
}
export async function readAdminDashboard(db: Firestore) {
  const [products, stats, reactions, audit] = await Promise.all([db.collection("products").get(), db.collection("pageStats").get(), db.collection("reactionStats").get(), db.collection("adminAudit").orderBy("createdAt", "desc").limit(20).get()]);
  const items = products.docs.map(doc => ({ id: doc.id, data: doc.data() }));
  const sum = (prefix: string) => stats.docs.filter(doc => doc.id.startsWith(prefix)).reduce((total, doc) => total + (Number(doc.data().views) || 0), 0);
  return { total: items.length, active: items.filter(item => item.data.isActive === true).length, noImage: items.filter(item => !item.data.imageUrl).length, noPrice: items.filter(item => item.data.bestPriceCents == null).length, productViews: sum("product:"), comparisonViews: sum("comparison:"), reactions: reactions.docs.reduce((total, doc) => total + (Number(doc.data().total) || 0), 0), offers: items.reduce((total, item) => total + (Array.isArray(item.data.offers) ? item.data.offers.filter((offer: Record<string, unknown>) => offer.is_available === true).length : 0), 0), audit: audit.docs.map(doc => ({ id: doc.id, action: string(doc.data().action), name: string(doc.data().name), productId: string(doc.data().productId), email: string(doc.data().actorEmail), at: doc.data().createdAt?.toDate().toISOString() ?? "" })) };
}
