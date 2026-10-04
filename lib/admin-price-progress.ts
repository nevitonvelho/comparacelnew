export type PriceRefreshNotice = { productId?: string; message: string };
export type PriceRefreshJob = {
  version: 1;
  queue: { id: string; name: string; offerId: string }[];
  next: number;
  changed: number;
  checked: number;
  skipped: number;
  failed: number;
  errors: PriceRefreshNotice[];
  updatedAt: number;
};
export function readPriceRefreshJob(raw: string | null): PriceRefreshJob | null {
  if (!raw) return null;
  try {
    const job = JSON.parse(raw) as PriceRefreshJob;
    if (job.version !== 1 || !Array.isArray(job.queue) || !job.queue.length || job.queue.length > 500 ||
      !job.queue.every(item => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.offerId === "string") ||
      ![job.next, job.changed, job.checked, job.skipped, job.failed].every(value => Number.isSafeInteger(value) && value >= 0) || job.next > job.queue.length ||
      !Number.isFinite(job.updatedAt) || !Array.isArray(job.errors) || job.errors.length > 20 ||
      !job.errors.every(item => item && typeof item.message === "string" && (item.productId === undefined || typeof item.productId === "string"))) return null;
    return job;
  } catch { return null; }
}
