import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { AdminError } from "./admin-model";
import { productFromData } from "./product-data";
import { absoluteUrl, siteUrl } from "./seo";
import { seoDocumentId } from "./seo-content";
import { contentDiagnosis, metricsForPath, performanceLabel, validateSeoFields, validateSeoPath, type SearchSnapshot, type SeoFields, type SeoPage, type SeoHistory } from "./seo-workbench";

function fieldsFromProduct(data: Record<string, unknown>): SeoFields {
  return { title: String(data.meta_title || ""), metaDescription: String(data.meta_description || ""), description: String(data.description || ""), tags: Array.isArray(data.seo_tags) ? data.seo_tags.filter((tag): tag is string => typeof tag === "string").slice(0, 8) : [] };
}
function sourceFingerprint(path: string, records: Record<string, unknown>[], seoRevision: number) {
  return createHash("sha256").update(JSON.stringify({ path, products: records.map(value => ({ name: value.name, revision: value.adminRevision || 0, fields: fieldsFromProduct(value), specs: value.specs, isActive: value.isActive })), saved: seoRevision })).digest("hex");
}
export async function readSeoTarget(db: Firestore, path: string, snapshot?: SearchSnapshot | null, preload?: { products: Map<string, Record<string, unknown>>; seo: Map<string, Record<string, unknown>> }) {
  const target = validateSeoPath(path);
  const data = preload ? target.ids.map(id => preload.products.get(id)) : (await db.getAll(...target.ids.map(id => db.collection("products").doc(id)))).map(doc => doc.data());
  if (data.some(value => !value)) throw new AdminError("Produto não encontrado.", 404);
  const records = data as Record<string, unknown>[];
  const products = records.map((value, index) => productFromData(target.ids[index], value));
  if (products.length === 2 && products[0].category !== products[1].category) throw new AdminError("Compare produtos da mesma categoria.");
  const saved = target.kind === "comparison" ? preload ? preload.seo.get(path) : (await db.collection("seoPages").doc(seoDocumentId(path)).get()).data() : undefined;
  const fields: SeoFields = target.kind === "product" ? fieldsFromProduct(records[0]) : saved?.fields || { title: "", metaDescription: "", description: "", tags: [] };
  const fingerprint = sourceFingerprint(path, records, Number(saved?.revision) || 0);
  const current = snapshot ? metricsForPath(snapshot.rows, path, siteUrl) : null;
  const previous = snapshot ? metricsForPath(snapshot.previousRows, path, siteUrl) : null;
  const page: SeoPage = { path, kind: target.kind, name: products.map(product => product.name).join(" vs "), active: records.every(value => value.isActive === true), fields, fingerprint, ...contentDiagnosis(fields, { hasImage: products.every(product => Boolean(product.imageUrl)), specs: products.reduce((sum, product) => sum + product.specs.filter(spec => spec.display !== "—").length, 0), comparison: target.kind === "comparison" }), current, previous, performance: performanceLabel(current) };
  return { page, context: { kind: target.kind, products: products.map(product => ({ name: product.name, brand: product.brand, category: product.category, specs: product.specs.slice(0, 120).map(spec => ({ name: spec.name, group: spec.group, value: spec.display.slice(0, 300) })), description: product.description?.slice(0, 8000) })) }, versions: records.map(value => Number(value.adminRevision) || 0), seoRevision: Number(saved?.revision) || 0 };
}

export async function seoHistory(db: Firestore, path: string): Promise<SeoHistory[]> {
  const history = await db.collection("adminSeoHistory").where("path", "==", path).orderBy("at", "desc").limit(8).get();
  return history.docs.map(doc => { const value = doc.data(); return { id: doc.id, at: value.at, email: value.email || "", before: value.before, after: value.after }; });
}

export async function saveSeoFields(db: Firestore, actor: { uid: string; email?: string }, path: string, fingerprint: unknown, value: unknown) {
  const target = await readSeoTarget(db, path);
  if (typeof fingerprint !== "string" || fingerprint !== target.page.fingerprint) throw new AdminError("O conteúdo mudou. Reabra o diagnóstico antes de aplicar.", 409);
  const fields = validateSeoFields(value);
  const parsed = validateSeoPath(path);
  const refs = parsed.ids.map(id => db.collection("products").doc(id));
  const seoRef = db.collection("seoPages").doc(seoDocumentId(path));
  const historyRef = db.collection("adminSeoHistory").doc();
  const auditRef = db.collection("adminAudit").doc();
  const at = new Date().toISOString();
  await db.runTransaction(async tx => {
    const latest = await tx.getAll(...refs);
    const seo = parsed.kind === "comparison" ? await tx.get(seoRef) : null;
    if (latest.some(doc => !doc.exists) || sourceFingerprint(path, latest.map(doc => doc.data() || {}), Number(seo?.data()?.revision) || 0) !== fingerprint) throw new AdminError("A página foi alterada em outra aba. Recarregue o diagnóstico.", 409);
    const stamp = Timestamp.now();
    if (parsed.kind === "product") tx.set(refs[0], { meta_title: fields.title, meta_description: fields.metaDescription, description: fields.description, seo_tags: fields.tags, adminRevision: target.versions[0] + 1, updatedAt: stamp, updated_at: at }, { merge: true });
    else tx.set(seoRef, { path, fields, revision: target.seoRevision + 1, updatedAt: stamp, updatedBy: actor.uid }, { merge: true });
    tx.set(historyRef, { path, at, email: actor.email || "", uid: actor.uid, before: target.page.fields, after: fields });
    tx.set(auditRef, { action: "seo.update", at: stamp, email: actor.email || "", uid: actor.uid, name: target.page.name, productId: parsed.ids[0] });
  });
  return { path, url: absoluteUrl(path) };
}

export async function claimSeoAction(db: Firestore, uid: string, kind: "generate" | "sync", now = Date.now()) {
  const ref = db.collection("adminSeoLimits").doc(kind === "sync" ? "search-sync" : seoDocumentId(uid));
  await db.runTransaction(async tx => {
    const data = (await tx.get(ref)).data() || {};
    const day = new Date(now).toISOString().slice(0, 10);
    const count = data.day === day ? Number(data.count) || 0 : 0;
    const cooldown = kind === "sync" ? 300000 : 30000;
    if (Number(data.lastAt) > now - cooldown) throw new AdminError(`Aguarde ${kind === "sync" ? "5 minutos entre sincronizações" : "30 segundos entre gerações"}.`, 429);
    if (kind === "generate" && count >= 30) throw new AdminError("Limite de 30 gerações por conta/dia atingido.", 429);
    tx.set(ref, { day, count: count + 1, lastAt: now });
  });
}
