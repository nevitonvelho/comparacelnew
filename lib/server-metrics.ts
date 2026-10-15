import "server-only";
import { unstable_cache } from "next/cache";
import { getAdminDatabase } from "./firebase/admin";
import { readProductMetrics } from "./product-metrics-store";
import { readPopularComparisons } from "./comparison-activity";

// Public counters only: prices, visitor receipts and user records are never cached here.
export const getServerProductMetrics = unstable_cache(
  (id: string) => readProductMetrics(getAdminDatabase(), id),
  ["public-product-metrics-mysql-v2"],
  { revalidate: 60 },
);

const readRanking = unstable_cache(
  (day: string) => readPopularComparisons(getAdminDatabase(), Date.parse(`${day}T00:00:00.000Z`)),
  ["public-popular-comparisons-mysql-v2"],
  { revalidate: 60 },
);

export function getServerPopularComparisons() {
  // A new UTC day must not reuse yesterday's seven-day window.
  return readRanking(new Date().toISOString().slice(0, 10));
}
