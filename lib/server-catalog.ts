import "server-only";
import { cache } from "react";
import { FieldPath } from "firebase-admin/firestore";
import { unstable_cache, revalidateTag, revalidatePath } from "next/cache";
import { PUBLIC_CATALOG_TAG, publicCacheOptions } from "./public-cache";
import { getAdminDatabase } from "./firebase/admin";
import { productFromData, PUBLIC_PRODUCT_FIELDS } from "./product-data";
import { hasActiveOffer } from "./product-offers";
import { comparisonSlug, type Product } from "./product-model";

// Explicit Data Cache works with the existing dynamic layout, without enabling
// Cache Components (which would change routing behavior throughout the app).
export function invalidateServerCatalog() {
  revalidateTag(PUBLIC_CATALOG_TAG, { expire: 0 });
  // Includes cached 404s for newly created product/category URLs.
  revalidatePath("/", "layout");
  revalidatePath("/sitemap.xml");
}
// Keep each entry below Next.js' 2 MB Data Cache limit.
const readProductBatch = unstable_cache(async (after: string) => {
  let query = getAdminDatabase().collection("products").where("isActive", "==", true)
    .select(...PUBLIC_PRODUCT_FIELDS).orderBy(FieldPath.documentId()).limit(50);
  if (after) query = query.startAfter(after);
  const snapshot = await query.get();
  return {
    products: snapshot.docs.map(doc => productFromData(doc.id, doc.data())),
    next: snapshot.size === 50 ? snapshot.docs[snapshot.docs.length - 1].id : "",
  };
}, ["public-product-batch-mysql-v2"], publicCacheOptions);
export const getServerProducts = cache(async (): Promise<Product[]> => {
  const products: Product[] = [];
  let after = "";
  do {
    const batch = await readProductBatch(after);
    products.push(...batch.products);
    after = batch.next;
  } while (after);
  return products.filter(hasActiveOffer).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});
export async function getServerProduct(id: string) {
  return (await getServerProducts()).find(product => product.id === id);
}
const readBrands = unstable_cache(async () => {
  const snapshot = await getAdminDatabase().collection("brands").select("slug", "name").get();
  return snapshot.docs.map(doc => ({ slug: String(doc.data().slug ?? ""), name: String(doc.data().name ?? "") }));
}, ["public-brands-mysql-v2"], publicCacheOptions);
export const getServerBrands = cache(async () => {
  const [brands, products] = await Promise.all([readBrands(), getServerProducts()]);
  return brands.filter(brand => /^[a-z0-9-]+$/.test(brand.slug) && products.some(product => product.brand === brand.name))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
});
export async function getComparisonPair(slug: string) {
  const ids = slug.split("-vs-");
  if (ids.length !== 2 || ids[0] === ids[1]) return null;
  const products = await getServerProducts();
  const a = products.find(product => product.id === ids[0]);
  const b = products.find(product => product.id === ids[1]);
  return a && b && a.category === b.category ? { a, b, slug: comparisonSlug(ids) } : null;
}
