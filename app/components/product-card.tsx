"use client";
import Link from "next/link";
import { purchaseOffers } from "@/lib/product-offers";
import { AffiliateLink } from "./affiliate-link";
import { PriceUpdated } from "./price-updated";
import { UiIcon } from "./icons";
import { useCatalog } from "./catalog-provider";
import { LibraryButton } from "./user-actions";
import { ReactionCounters } from "./reactions";
import { ProductScore } from "./product-score";
import { ProductImage } from "./product-image";
import { money, type Product } from "@/lib/product-model";

export function ProductCard({ product, compact = false, showReactions = !compact }: { product: Product; compact?: boolean; showReactions?: boolean }) {
  const { categoryNames, selected, toggle } = useCatalog();
  const offer = purchaseOffers(product)[0];
  if (!offer) return null;
  const highlights = product.highlights.filter(item => item.kind === "pro").slice(0, 2);
  return <article className={`product-card${compact ? " compact" : ""}`}>
    <div className="product-art-wrapper">
      <div className="card-social-bar">{showReactions && <ReactionCounters productId={product.id} />}<LibraryButton kind="likedProducts" productIds={[product.id]} compact /></div>
      <ProductScore productId={product.id} />
      <Link className="product-art" href={`/produto/${product.id}`} aria-label={`Ver ${product.name}`}>
        <ProductImage name={product.name} url={product.imageUrl} />
        <span className="category-tag">{categoryNames[product.category] ?? product.category}</span>
      </Link>
    </div>
    <div className="product-content">
      {!compact && <span className="brand-name">{product.brand}</span>}
      <h3><Link href={`/produto/${product.id}`}>{product.name}</Link></h3>
      {!compact && <p className="card-summary">{product.specs.length ? `${product.specs.length} especificações para conferir` : "Consulte as ofertas disponíveis"}</p>}
      {!compact && highlights.length > 0 && <ul className="card-highlights">{highlights.map((item, index) => <li key={index}>{item.text}</li>)}</ul>}
      <div className={`price${offer ? "" : " no-active-offer"}`}>
        {!compact && <small>{offer?.price != null ? "Oferta cadastrada" : "Ofertas"}</small>}
        <strong>{!offer ? "Sem oferta ativa" : offer.price === null ? "Consultar na loja" : money(offer.price)}</strong>
        {!offer && <small className="card-merchant">Nenhum link de compra disponível</small>}
        {offer?.priceCondition === "pix" && <small className="card-merchant">No Pix</small>}
        {offer && !compact && <PriceUpdated dates={[offer.priceUpdatedAt]} />}
      </div>
      {offer ? <AffiliateLink product={product} offer={offer} position="product_card" /> : <Link className="button secondary card-details-cta" href={`/produto/${product.id}`}>Conhecer o produto <UiIcon name="right" /></Link>}
      <div className="card-actions">
        {!offer && compact ? <span className="card-spec-count">{product.specs.length ? `${product.specs.length} especificações` : "Compare características"}</span> : <Link className="button secondary" href={`/produto/${product.id}`}>Ver produto <UiIcon name="external" /></Link>}
        <button className={`compare-button ${selected.includes(product.id) ? "chosen" : ""}`} aria-pressed={selected.includes(product.id)} onClick={() => toggle(product)}>
          <UiIcon name={selected.includes(product.id) ? "check" : "add"} />{selected.includes(product.id) ? "Selecionado" : "Comparar"}
        </button>
      </div>
    </div>
  </article>;
}
