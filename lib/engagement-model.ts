export type PageKind = "product" | "comparison";
export type Engagement = { views: number; likes: number };
export function pageIdentity(kind: unknown, ids: unknown): {kind:PageKind;ids:string[];key:string} | null {
  if ((kind !== "product" && kind !== "comparison") || !Array.isArray(ids)
    || ids.length !== (kind === "product" ? 1 : 2)
    || ids.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,400}$/.test(id))
    || new Set(ids).size !== ids.length) return null;
  const sorted = [...ids].sort() as string[];
  return { kind, ids: sorted, key: `${kind}:${sorted.join("-vs-")}` };
}
export const VISIT_WINDOW_MS = 30 * 60 * 1000;
export function shouldCountVisit(lastSeen: number | undefined, now: number) {
  return lastSeen === undefined || now - lastSeen >= VISIT_WINDOW_MS;
}
export function popularity({views,likes}: Engagement) {
  const points = views + likes * 10;
  const thresholds = [0, 25, 100, 300, 1000];
  const labels = ["Começando", "Despertando interesse", "Em alta", "Muito procurado", "Popular"];
  const index = thresholds.reduce((level, threshold, candidate) => points >= threshold ? candidate : level, 0);
  return { label: labels[index], level:index + 1, points };
}
