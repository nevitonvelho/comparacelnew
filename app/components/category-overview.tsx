"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { useCatalog } from "./catalog-provider";
export function CategoryOverview() {
  const { products, categorySettings } = useCatalog();
  const categories = categorySettings.categories.filter(item => item.showOnHome && products.some(product => product.category === item.id)).slice(0, categorySettings.homeLimit);
  return <section className="category-overview"><div className="section-heading"><div><span className="eyebrow">O QUE VOCÊ QUER COMPARAR?</span><h2>Comece pela categoria.</h2></div><Link href="/catalogo" className="section-link">Explorar tudo <UiIcon name="right" /></Link></div><div className="category-grid">{categories.map(({id:slug, name, representativeProductId}) => {
    const items = products.filter(product => product.category === slug);
    const representative = items.find(product => product.id === representativeProductId && product.imageUrl) ?? items.find(product => product.imageUrl);
    return <Link key={slug} href={`/${slug}`}><ProductImage name={name} url={representative?.imageUrl ?? null} /><strong>{name}<span aria-hidden="true"><UiIcon name="external" /></span></strong><small>{items.length} produtos</small></Link>;
  })}</div></section>;
}
