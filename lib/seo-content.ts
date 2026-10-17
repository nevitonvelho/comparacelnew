import "server-only";
import { createHash } from "node:crypto";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { publicCacheOptions } from "./public-cache";
import { getAdminDatabase } from "./firebase/admin";
import type { SeoFields } from "./seo-workbench";

export const seoDocumentId = (path: string) => createHash("sha256").update(path).digest("hex");
export const readComparisonSeo = cache(unstable_cache(async (path: string): Promise<SeoFields | null> => {
  try {
    const data = (await getAdminDatabase().collection("seoPages").doc(seoDocumentId(path)).get()).data();
    return data?.fields || null;
  } catch { return null; }
}, ["public-comparison-seo-v1"], publicCacheOptions));
