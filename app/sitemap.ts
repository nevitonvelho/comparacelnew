import { getServerCategorySettings } from "@/lib/server-public-data";
import { unstable_cache } from "next/cache";
import { publicCacheOptions } from "@/lib/public-cache";
import type { MetadataRoute } from "next";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { getServerBrands, getServerProducts } from "@/lib/server-catalog";
import { comparisonSlug } from "@/lib/product-model";
import { absoluteUrl, productModifiedAt } from "@/lib/seo";
export const revalidate = 1800;
const readComparisonIds = unstable_cache(async () => {
  const db = getAdminDatabase();
  const snapshots = await Promise.all([db.collection("comparisons").limit(5000).get(), db.collection("comparisonActivity").limit(5000).get()]);
  return snapshots.flatMap(snapshot => snapshot.docs.map(doc => {
    const data = doc.data();
    return Array.isArray(data.productIds) ? data.productIds : [data.productASlug ?? "", data.productBSlug ?? ""];
  }));
}, ["public-sitemap-comparisons-v1"], publicCacheOptions);
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getServerProducts();
  const comparisons = await readComparisonIds();
  const entries: MetadataRoute.Sitemap = ["/", "/catalogo", "/comparar", "/comunidade"].map(path => ({ url: absoluteUrl(path), changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));
  for (const category of (await getServerCategorySettings()).categories.map(item=>item.id)) if (products.some(product => product.category === category)) entries.push({ url: absoluteUrl(`/${category}`), changeFrequency: "weekly", priority: 0.7 });
  // Next interpolates image URLs directly into XML; escape query separators.
  for (const product of products) entries.push({ url: absoluteUrl(`/produto/${product.id}`), ...(productModifiedAt(product) ? { lastModified: productModifiedAt(product) } : {}), ...(product.imageUrl ? { images: [product.imageUrl.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;")] } : {}), changeFrequency: "weekly", priority: 0.8 });
  entries.push({ url: absoluteUrl("/marcas"), changeFrequency: "monthly", priority: 0.5 });
  for (const brand of await getServerBrands()) entries.push({ url: absoluteUrl(`/marca/${brand.slug}`), changeFrequency: "monthly", priority: 0.5 });
  const pairs = new Set<string>();
  for (const ids of comparisons) {
    if (ids.length !== 2 || ids[0] === ids[1]) continue;
    const a = products.find(product => product.id === ids[0]);
    const b = products.find(product => product.id === ids[1]);
    if (a && b && a.category === b.category) pairs.add(comparisonSlug(ids));
  }
  for (const slug of [...pairs].slice(0, 5000)) entries.push({ url: absoluteUrl(`/comparar/${slug}`), changeFrequency: "weekly", priority: 0.6 });
  return entries;
}
