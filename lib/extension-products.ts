import { offerPriceFreshness, offerProductPage } from "./admin-price-freshness";
import type { Firestore } from "firebase-admin/firestore";
import { AdminError, type AdminProduct, slugify } from "./admin-model";
import { parseImportLine, type ImportSource } from "./admin-import-model";
import { adminProductFromData } from "./admin-store";

export function extensionProductIdentity(pageUrl: string, source: ImportSource) {
  const entry = parseImportLine(pageUrl, source);
  if (!entry.externalId) throw new AdminError("Abra a página do produto para identificar o anúncio.");
  return entry.kind === "item" ? `item-${entry.externalId}` : entry.externalId;
}
export function offerMatchesIdentity(offer: AdminProduct["offers"][number], source: ImportSource, externalId: string) {
  if (offer.externalId === externalId) return true;
  try { return extensionProductIdentity(offer.url, source) === externalId; } catch { return false; }
}
export function offerBelongsToSource(offer: AdminProduct["offers"][number], source: ImportSource) {
  try {
    const host=new URL(offer.url).hostname.toLowerCase();
    return source === "amazon" ? host === "amzn.to" || host === "amazon.com.br" || host.endsWith(".amazon.com.br") : host === "meli.la" || host === "mercadolivre.com.br" || host.endsWith(".mercadolivre.com.br") || host === "mercadolivre.com" || host.endsWith(".mercadolivre.com");
  } catch { return false; }
}
export async function lookupExtensionProduct(db: Firestore, source: ImportSource, externalId: string) {
  const mapping = await db.doc(`adminImportSources/${source}-${externalId}`).get();
  if (mapping.exists) {
    const doc = await db.doc(`products/${mapping.data()!.productId}`).get();
    if (doc.exists) return adminProductFromData(doc.id, doc.data()!);
  }
  const products = await db.collection("products").get();
  const matches = products.docs.map(doc => adminProductFromData(doc.id, doc.data())).filter(product => product.offers.some(offer => offerMatchesIdentity(offer, source, externalId)));
  if (matches.length > 1) throw new AdminError("Este anúncio aparece em mais de uma ficha. Corrija as ofertas no painel.", 409);
  return matches[0] ?? null;
}
export async function searchExtensionProducts(db: Firestore, query: string) {
  const normalized = slugify(query).replaceAll("-", " ");
  if (normalized.length < 2) return [];
  const words = normalized.split(" ");
  const products = await db.collection("products").get();
  return products.docs.map(doc => adminProductFromData(doc.id, doc.data())).map(product => {
    const text = slugify(`${product.name} ${product.id}`).replaceAll("-", " ");
    const exact=slugify(query)===slugify(product.name) || slugify(query)===product.id;
    const allWords=words.every(word=>text.includes(word));
    const similarity=extensionProductSimilarity(query,product.name);
    return {product,score:exact?3:allWords?2:similarity};
  }).filter(match=>match.score>0).sort((a,b)=>b.score-a.score || a.product.name.localeCompare(b.product.name))
    .slice(0,30).map(match=>extensionProductSummary(match.product));
}
export function extensionProductSummary(product: AdminProduct) {
  return {id: product.id, name: product.name, category: product.category, offers: product.offers.map(offer => ({storeId: offer.storeId, externalId: offer.externalId, url: offer.url, price: offer.price})), editPath: `/admin?produto=${encodeURIComponent(product.id)}`};
}

function productNameTokens(value: string) {
  const normalized=slugify(value.replace(/(\d+)\s*["″”]/g, "$1pol").replace(/micro[ -]?ondas/gi,"microondas")).replaceAll("-", " ")
    .replace(/\b(\d+)\s+(gb|tb|mb|kg|l|litros|v|volts|w|watts|pol|polegadas)\b/g, "$1$2");
  const ignored=new Set(["de","da","do","das","dos","com","para","e","a","o","um","uma","produto","novo","nova","amazon","mercado","livre"]);
  return [...new Set(normalized.split(" ").filter(word=>word.length>1 && !ignored.has(word)).map(word=>word.replace(/^un(\d{2})([a-z]\d{4}[a-z])[a-z0-9]*$/, "$1pol $2").replace(/litros$/, "l").replace(/volts$/, "v").replace(/watts$/, "w").replace(/polegadas$/, "pol")).flatMap(word=>word.split(" ")))];
}
export function extensionProductSimilarity(pageName: string, productName: string) {
  const page=productNameTokens(pageName);const product=productNameTokens(productName);
  if(page.length<2 || product.length<2)return 0;
  const shared=page.filter(word=>product.includes(word));
  // Compare each attribute separately; missing voltage is not a conflict.
  const units=/^\d+(?:gb|tb|mb|kg|l|v|w|pol)$/;
  const models=(words:string[])=>words.filter(word=>/[a-z]/.test(word) && /\d/.test(word) && !units.test(word) && !/^(?:4k|8k|5g|4g|3g)$/.test(word));
  const pageModels=models(page);const productModels=models(product);
  if(pageModels.length && productModels.length && !pageModels.some(model=>productModels.includes(model)))return 0;
  for(const unit of ["gb","tb","mb","kg","l","v","w","pol"]) {
    const attribute=new RegExp(`^\\d+${unit}$`);
    const pageValues=page.filter(word=>attribute.test(word));const productValues=product.filter(word=>attribute.test(word));
    if(pageValues.length && productValues.length && !pageValues.some(value=>productValues.includes(value)))return 0;
  }
  const colors=(words:string[])=>words.map(word=>word==="garfite"?"grafite":word).filter(word=>["preto","branco","verde","azul","rosa","grafite","chumbo","vermelho","roxo","laranja","prata","dourado"].includes(word));
  const pageColors=colors(page),productColors=colors(product);
  if(pageColors.length && productColors.length && !pageColors.some(color=>productColors.includes(color)))return 0;
  const sharedModel=pageModels.some(model=>productModels.includes(model));
  if(sharedModel && shared.length>=3)return 0.9+0.1*shared.length/Math.max(page.length,product.length);
  if(shared.length<Math.min(3,page.length,product.length))return 0;
  const coverage=shared.length/Math.min(page.length,product.length);
  const overlap=2*shared.length/(page.length+product.length);
  return coverage>=0.65 && overlap>=0.5?overlap:0;
}
export async function suggestExtensionProducts(db: Firestore, pageName: string) {
  const products=await db.collection("products").get();
  return products.docs.map(doc=>adminProductFromData(doc.id,doc.data()))
    .map(product=>({product,score:extensionProductSimilarity(pageName,product.name)}))
    .filter(match=>match.score>0).sort((a,b)=>b.score-a.score || a.product.name.localeCompare(b.product.name))
    .slice(0,5).map(match=>extensionProductSummary(match.product));
}

export function extensionPriceQueue(products: AdminProduct[], days = 7, now = Date.now()) {
  return products.flatMap(product => product.offers.flatMap(offer => {
    const source = (["amazon", "mercadolivre"] as const).find(source => offerBelongsToSource(offer, source));
    if (!source) return [];
    const freshness = offerPriceFreshness(offer, days, now);
    if (!["due", "never", "unavailable"].includes(freshness.state)) return [];
    const pageUrl = offerProductPage(offer, source === "amazon" ? "Amazon" : "Mercado Livre");
    // Short affiliate URLs without a known identity require manual review.
    try {
      const identity = extensionProductIdentity(pageUrl, source);
      if (!offerMatchesIdentity(offer, source, identity)) return [];
      return [{productId: product.id, name: product.name, storeId: offer.storeId, source, identity, pageUrl, offerUrl: offer.url, checkedAt: freshness.checkedAt}];
    } catch { return []; }
  })).sort((a, b) => (a.checkedAt ?? 0) - (b.checkedAt ?? 0) || a.name.localeCompare(b.name));
}

export function validateExtensionBatchOffer(product: AdminProduct | null, source: "amazon" | "mercadolivre", identity: string, input: Record<string, unknown>) {
  if (!["price", "unavailable"].includes(String(input.mode)) || !product || typeof input.storeId !== "string" || typeof input.offerUrl !== "string") throw new AdminError("Lote inválido.");
  const offer = product.offers.find(offer => offer.storeId === input.storeId);
  if (!offer || offer.url !== input.offerUrl || !offerBelongsToSource(offer, source) || !offerMatchesIdentity(offer, source, identity)) {
    throw new AdminError("O anúncio não corresponde à oferta cadastrada. Revise no painel.", 409);
  }
}
