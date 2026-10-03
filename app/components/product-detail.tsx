"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { ProductScore } from "./product-score";
import { Reactions } from "./reactions";
import { PageEngagement } from "./engagement";
import { categoryNames, money } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { LoadState } from "./catalog";
import { LibraryButton } from "./user-actions";
import { ProductImage } from "./product-image";
export function ProductDetail({ slug }: { slug: string }) {
  const { products, selected, toggle, status, message } = useCatalog();
  const product = products.find(item => item.id === slug);
  if (status !== "ready") return <main id="conteudo"><LoadState /></main>;
  if (!product) return <main id="conteudo" className="empty"><h1>Produto não encontrado</h1><Link href="/catalogo">Voltar ao catálogo <UiIcon name="right" /></Link></main>;
  const groups = [...new Set(product.specs.map(spec => spec.group))];
  return <main id="conteudo"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href={`/${product.category}`}>{categoryNames[product.category] ?? "Catálogo"}</Link><span>/</span><span>Produto</span></div><section className="detail-hero"><div className="detail-photo"><ProductImage name={product.name} url={product.imageUrl} large /></div><div><span className="eyebrow">{product.brand}</span><h1>{product.name}</h1><p>{categoryNames[product.category] ?? product.category}</p><div className="price"><small>A partir de</small><strong>{product.price === null ? "Consultar na loja" : money(product.price)}</strong></div><button className={`button ${selected.includes(product.id) ? "secondary" : "primary"}`} onClick={() => toggle(product)}><UiIcon name={selected.includes(product.id) ? "check" : "add"} />{selected.includes(product.id) ? "Remover da comparação" : "Adicionar à comparação"}</button><LibraryButton kind="likedProducts" productIds={[product.id]} /><ProductScore productId={product.id} explain /><PageEngagement kind="product" productIds={[product.id]} /><Reactions kind="product" productIds={[product.id]} /><p role="status" className="selection-message">{message}</p></div></section><section className="offers"><h2>Onde comprar</h2><p>Confira o preço e a disponibilidade no site da loja.</p>{product.offers.filter(offer => offer.available && offer.url).map(offer => <div className="offer" key={offer.id}><strong>{offer.store}</strong><span>{offer.price === null ? "Consultar preço" : money(offer.price)}</span><a className="button primary" href={offer.url!} target="_blank" rel="noopener noreferrer sponsored">Ir à loja <UiIcon name="external" /></a></div>)}{!product.offers.some(offer => offer.available && offer.url) && <p>Sem ofertas disponíveis no momento.</p>}</section>{product.highlights.length > 0 && <section className="highlights"><div><h2>Pontos positivos</h2><ul>{product.highlights.filter(item => item.kind === "pro").map((item, index) => <li key={index}>{item.text}</li>)}</ul></div><div><h2>Pontos de atenção</h2><ul>{product.highlights.filter(item => item.kind === "con").map((item, index) => <li key={index}>{item.text}</li>)}</ul></div></section>}<section className="specs-section"><h2>Ficha técnica completa</h2>{!groups.length && <p>A ficha técnica deste produto ainda não foi cadastrada.</p>}{groups.map(group => <div className="spec-group" key={group}><h3>{group}</h3><dl>{product.specs.filter(spec => spec.group === group).sort((a, b) => a.order - b.order).map(spec => <div key={spec.key}><dt>{spec.name}</dt><dd>{spec.display}</dd></div>)}</dl></div>)}</section></main>;
}
