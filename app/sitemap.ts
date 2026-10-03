import type { MetadataRoute } from "next";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { getServerBrands, getServerProducts } from "@/lib/server-catalog";
import { categoryNames, comparisonSlug } from "@/lib/product-model";
import { absoluteUrl } from "@/lib/seo";
export const dynamic = "force-dynamic";
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await getServerProducts();
  const db = getAdminDatabase();
  const [legacy, activity] = await Promise.all([db.collection("comparisons").limit(5000).get(), db.collection("comparisonActivity").limit(5000).get()]);
  const entries: MetadataRoute.Sitemap = ["/", "/catalogo", "/comparar", "/comunidade"].map(path => ({ url: absoluteUrl(path), changeFrequency: "weekly", priority: path === "/" ? 1 : 0.7 }));
  for (const category of Object.keys(categoryNames)) if (products.some(product => product.category === category)) entries.push({ url: absoluteUrl(`/${category}`), changeFrequency: "weekly", priority: 0.7 });
  for (const product of products) entries.push({ url: absoluteUrl(`/produto/${product.id}`), ...(product.imageUrl ? { images: [product.imageUrl] } : {}), changeFrequency: "weekly", priority: 0.8 });
  entries.push({ url: absoluteUrl("/marcas"), changeFrequency: "monthly", priority: 0.5 });
  for (const brand of await getServerBrands()) entries.push({ url: absoluteUrl(`/marca/${brand.slug}`), changeFrequency: "monthly", priority: 0.5 });
  const pairs = new Set<string>();
  for (const doc of [...legacy.docs, ...activity.docs]) {
    const data = doc.data();
    const ids = Array.isArray(data.productIds) ? data.productIds : [data.productASlug, data.productBSlug];
    if (ids.length !== 2 || ids[0] === ids[1]) continue;
    const a = products.find(product => product.id === ids[0]);
    const b = products.find(product => product.id === ids[1]);
    if (a && b && a.category === b.category) pairs.add(comparisonSlug(ids));
  }
  for (const slug of [...pairs].slice(0, 5000)) entries.push({ url: absoluteUrl(`/comparar/${slug}`), changeFrequency: "weekly", priority: 0.6 });
  return entries;
}
