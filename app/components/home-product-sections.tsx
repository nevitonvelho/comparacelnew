"use client";
import Link from "next/link";
import { HomeCarousel } from "./home-carousel";
import { useCatalog } from "./catalog-provider";
import { ProductCard } from "./product-card";
import { ProductImage } from "./product-image";
import { UiIcon } from "./icons";
import { money, type Product } from "@/lib/product-model";

const editorialScore=(product:Product)=>Number(product.score.replace(",",".")) || 0;
function lastUpdate(product:Product) {
  return Math.max(0,...[product.updatedAt,...product.offers.map(offer=>offer.priceUpdatedAt)].map(date=>date?Date.parse(date):0).filter(Number.isFinite));
}
export function HomeProductSections({initialProducts=[]}:{initialProducts?:Product[]}) {
  const { products:catalogProducts,categoryNames,status }=useCatalog();
  const products=catalogProducts.length?catalogProducts:initialProducts;
  const rated=products.filter(product=>editorialScore(product)>0);
  const top=[...(rated.length?rated:products)].sort((a,b)=>rated.length?editorialScore(b)-editorialScore(a) || a.name.localeCompare(b.name,"pt-BR"):b.specs.length-a.specs.length || a.name.localeCompare(b.name,"pt-BR")).slice(0,9);
  const recent=products.map(product=>({product,updated:lastUpdate(product)})).filter(item=>item.updated>0).sort((a,b)=>b.updated-a.updated || a.product.name.localeCompare(b.product.name,"pt-BR")).slice(0,9);
  return <>
    <section className="home-highlights" aria-labelledby="home-top-title"><div className="section-heading"><div><span className="eyebrow">UM BOM PONTO DE PARTIDA</span><h2 id="home-top-title">Top produtos para conhecer.</h2><p>{rated.length?"Os produtos com as maiores notas editoriais cadastradas no catálogo.":"Produtos com fichas técnicas mais completas para você explorar e comparar."}</p></div><Link href="/catalogo" className="section-link">Explorar catálogo <UiIcon name="right" /></Link></div><HomeCarousel id="home-top-carousel" label="Top produtos" count={top.length}>{!top.length && <p className="empty" role="status">{status==="loading"?"Carregando os destaques…":"Os destaques aparecerão quando houver produtos no catálogo."}</p>}{top.map((product,index)=><div className="home-highlight-item" key={product.id}><div className="home-highlight-caption"><span>#{index+1} {rated.length?"Destaque editorial":"Ficha completa"}</span>{rated.length>0 && <strong>Nota editorial {product.score}/10</strong>}</div><ProductCard product={product} /></div>)}</HomeCarousel></section>
    <section className="home-recent" aria-labelledby="home-recent-title"><div className="section-heading"><div><span className="eyebrow">NOVIDADES NO CATÁLOGO</span><h2 id="home-recent-title">Últimas atualizações.</h2><p>Confira os produtos com fichas ou preços atualizados mais recentemente.</p></div><Link href="/catalogo" className="section-link">Ver produtos <UiIcon name="right" /></Link></div><HomeCarousel id="home-recent-carousel" label="Últimas atualizações" count={recent.length}>{!recent.length && <p className="empty" role="status">{status==="loading"?"Carregando as atualizações…":"As próximas atualizações de fichas e preços aparecerão aqui."}</p>}{recent.map(({product,updated})=><Link key={product.id} href={`/produto/${product.id}`} className="home-recent-card"><div className="home-recent-photo"><ProductImage name={product.name} url={product.imageUrl} sizes="96px" /></div><div className="home-recent-content"><span className="eyebrow">{categoryNames[product.category] ?? product.category}</span><h3>{product.name}</h3><time dateTime={new Date(updated).toISOString()}>Atualizado em {new Date(updated).toLocaleDateString("pt-BR",{timeZone:"America/Bahia",day:"2-digit",month:"2-digit",year:"numeric"})}</time><strong>{product.price===null?"Consultar ofertas":`A partir de ${money(product.price)}`}</strong></div></Link>)}</HomeCarousel></section>
  </>;
}
