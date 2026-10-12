export type ConversionEvent = "affiliate_click" | "offer_view" | "product_view" | "comparison_view";
export function pageType(path: string) {
  if (path.startsWith("/produto/")) return "product";
  if (path.startsWith("/comparar")) return "comparison";
  if (path === "/") return "home";
  if (path === "/catalogo") return "catalog";
  if (path.startsWith("/marca/")) return "brand";
  return "category";
}

// Explicit allowlist: never collect link URLs, searches, identities or user content.
export function conversionPayload(event: ConversionEvent, data: Record<string, string | undefined>, path: string) {
  return {
    event,
    page_type: data.pageType === "search" ? "search" : pageType(path),
    product_id: data.productId || null,
    product_name: data.productName || null,
    merchant: data.merchant || null,
    button_position: data.buttonPosition || null,
    offer_id: data.offerId || null,
    comparison_id: data.comparisonId || null,
  };
}
