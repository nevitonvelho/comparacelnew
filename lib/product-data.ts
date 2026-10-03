import type { Product } from "./product-model";
function text(value: unknown, fallback = "—"): string { return typeof value === "string" && value.trim() ? value : fallback; }
function number(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function safeUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export function productFromData(id: string, data: Record<string, unknown>): Product {
    const price = number(data.bestPriceCents);
    return {
      id, description: text(data.description, ""), metaTitle: text(data.meta_title, ""), metaDescription: text(data.meta_description, ""), name: text(data.name), brand: text(data.brandName), category: text(data.categorySlug, "outros"),
      score: typeof data.overallScore === "number" ? data.overallScore.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—",
      price: price === null ? null : price / 100,
      imageUrl: typeof data.imageUrl === "string" && data.imageUrl.startsWith("https://firebasestorage.googleapis.com/v0/b/comparacel.firebasestorage.app/o/") ? data.imageUrl : null,
      label: text(data.label, "Ficha técnica"),
      specs: (Array.isArray(data.specs) ? data.specs : []).map((spec: Record<string, unknown>) => ({
        key: `${text(spec.group, "Especificações")}:${text(spec.keySlug)}`, slug: text(spec.keySlug), name: text(spec.name), group: text(spec.group, "Especificações"), order: number(spec.order) ?? 0,
        display: text(spec.display), number: number(spec.value_number), higherIsBetter: typeof spec.higherIsBetter === "boolean" ? spec.higherIsBetter : null,
      })),
      offers: (Array.isArray(data.offers) ? data.offers : []).map((offer: Record<string, unknown>) => ({ id: String(offer.id), store: text(offer.storeName), price: number(offer.priceCents) === null ? null : Number(offer.priceCents) / 100, url: safeUrl(offer.url), available: offer.is_available === true })),
      highlights: (Array.isArray(data.highlights) ? data.highlights : []).map((item: Record<string, unknown>) => ({ kind: text(item.kind), text: text(item.text) })),
    };
}
