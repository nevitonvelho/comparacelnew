import type { Firestore } from "firebase-admin/firestore";
import { categoryNames } from "./product-model";
export type CategorySetting = { id: string; name: string; showOnHome: boolean; order: number; representativeProductId?: string };
export type CategorySettings = { categories: CategorySetting[]; homeLimit: number };
export async function readCategorySettings(db: Firestore): Promise<CategorySettings> {
  const [snapshot, settings] = await Promise.all([db.collection("categories").get(), db.doc("siteSettings/categories").get()]);
  const categories = snapshot.docs.map(doc => {
    const data = doc.data();
    return { id: String(data.slug ?? doc.id), name: String(data.name ?? data.slug ?? doc.id), showOnHome: data.showOnHome !== false, representativeProductId: typeof data.representativeProductId === "string" ? data.representativeProductId : "", order: Number.isInteger(data.homeOrder) ? Number(data.homeOrder) : Object.keys(categoryNames).indexOf(String(data.slug)) >= 0 ? Object.keys(categoryNames).indexOf(String(data.slug)) : 100 };
  }).sort((a,b) => a.order-b.order || a.name.localeCompare(b.name,"pt-BR"));
  return { categories, homeLimit: Number.isInteger(settings.data()?.homeLimit) ? Number(settings.data()!.homeLimit) : categories.length };
}
