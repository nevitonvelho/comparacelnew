import "server-only";
import { cache } from "react";
import { getAdminDatabase } from "./firebase/admin";
import { productFromData } from "./product-data";
import { comparisonSlug, type Product } from "./product-model";

let catalog: { until: number; products: Product[] } | null = null;
let pending: Promise<Product[]> | null = null;
export const getServerProducts = cache(async (): Promise<Product[]> => {
  if (catalog && catalog.until > Date.now()) return catalog.products;
  pending ??= getAdminDatabase().collection("products").where("isActive", "==", true).get()
    .then(snapshot => snapshot.docs.map(doc => productFromData(doc.id, doc.data())).sort((a, b) => a.name.localeCompare(b.name, "pt-BR")));
  try {
    const products = await pending;
    catalog = { until: Date.now() + 60000, products };
    return products;
  } finally { pending = null; }
});
export async function getServerProduct(id: string) {
  return (await getServerProducts()).find(product => product.id === id);
}
export const getServerBrands = cache(async () => {
  const snapshot = await getAdminDatabase().collection("brands").get();
  const products = await getServerProducts();
  return snapshot.docs.map(doc => ({ slug: String(doc.data().slug ?? ""), name: String(doc.data().name ?? "") }))
    .filter(brand => /^[a-z0-9-]+$/.test(brand.slug) && products.some(product => product.brand === brand.name))
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
