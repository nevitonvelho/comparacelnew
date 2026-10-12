import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { getAdminDatabase } from "./firebase/admin";
import { readCategorySettings } from "./category-settings";
import { priceHistoryPoints } from "./price-history";
import { publicCacheOptions } from "./public-cache";

export const getServerCategorySettings = cache(unstable_cache(
  () => readCategorySettings(getAdminDatabase()),
  ["public-categories-v1"], publicCacheOptions,
));
export const getServerPriceHistory = cache(unstable_cache(async (slug: string) => {
  if (!slug || slug.includes("/")) return [];
  const snapshot = await getAdminDatabase().collection("priceHistory").where("productSlug", "==", slug).get();
  return priceHistoryPoints(snapshot.docs.map(doc => doc.data()));
}, ["public-price-history-v1"], publicCacheOptions));
