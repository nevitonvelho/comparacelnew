import type { Product, Offer } from "./product-model";

function isActiveOffer(offer: Offer) {
  return offer.available && !!offer.url?.trim();
}

export function hasActiveOffer(product: Pick<Product, "offers">): boolean {
  return product.offers.some(isActiveOffer);
}

// Compare only purchasable offers; unknown prices always come last.
export function purchaseOffers(product: Pick<Product, "offers">): Offer[] {
  return product.offers.filter(isActiveOffer).sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
}

export function offerCta(store: string) {
  const normalized = store.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "mercadolivre") return "Ver oferta no Mercado Livre";
  if (["amazon", "amazonbrasil", "amazoncombr"].includes(normalized)) return "Conferir preço na Amazon";
  return `Ver oferta em ${store}`;
}

export function lowestOfferPrice(offers: Offer[]) {
  const prices = offers.flatMap(offer => offer.price === null ? [] : [offer.price]);
  return prices.length ? Math.min(...prices) : null;
}
