"use client";
import Link from "next/link";
import { UiIcon } from "./icons";
import { useCatalog } from "./catalog-provider";
import { LibraryButton } from "./user-actions";
import { ReactionCounters } from "./reactions";
import { ProductScore } from "./product-score";
import { ProductImage } from "./product-image";
import { money, type Product } from "@/lib/product-model";

export function ProductCard({ product }: { product: Product }) {
  const { categoryNames, selected, toggle } = useCatalog();
  return <article className="product-card"><div className="product-art-wrapper"><div className="card-social-bar"><ReactionCounters productId={product.id} /><LibraryButton kind="likedProducts" productIds={[product.id]} compact /></div><ProductScore productId={product.id} /><Link className="product-art" href={`/produto/${product.id}`} aria-label={`Ver ${product.name}`}><ProductImage name={product.name} url={product.imageUrl} /><span className="category-tag">{categoryNames[product.category] ?? product.category}</span></Link></div><div className="product-content"><span className="brand-name">{product.brand}</span><h3><Link href={`/produto/${product.id}`}>{product.name}</Link></h3><p className="card-summary">{product.specs.length ? `${product.specs.length} especificações para conferir` : "Consulte as ofertas disponíveis"}</p><div className="price"><small>{product.price === null ? "Ofertas" : "A partir de"}</small><strong>{product.price === null ? "Consultar na loja" : money(product.price)}</strong></div><div className="card-actions"><Link className="button secondary" href={`/produto/${product.id}`}>Ver produto <UiIcon name="external" /></Link><button className={`compare-button ${selected.includes(product.id) ? "chosen" : ""}`} aria-pressed={selected.includes(product.id)} onClick={() => toggle(product)}><UiIcon name={selected.includes(product.id) ? "check" : "add"} />{selected.includes(product.id) ? "Selecionado" : "Comparar"}</button></div></div></article>;
}
