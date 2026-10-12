import type { Product, Offer } from "@/lib/product-model";
import { offerCta } from "@/lib/product-offers";
import { UiIcon } from "./icons";

export function AffiliateLink({ product, offer, position, className = "button primary affiliate-cta", children }: { product: Product; offer: Offer; position: string; className?: string; children?: React.ReactNode }) {
  if (!offer.available || !offer.url) return null;
  return <a className={className} href={offer.url} target="_blank" rel="noopener noreferrer sponsored"
    data-affiliate-link="true" data-analytics-view="offer_view" data-product-id={product.id} data-product-name={product.name}
    data-merchant={offer.store} data-offer-id={offer.id} data-button-position={position}>
    {children ?? <>{offerCta(offer.store)} <UiIcon name="external" /></>}
  </a>;
}

export function AffiliateDisclosure() {
  return <p className="affiliate-disclosure">Podemos receber uma comissão por compras feitas pelos links de afiliados, sem custo adicional para você. Preços e disponibilidade podem mudar; confirme também frete e condições de pagamento na loja.</p>;
}
