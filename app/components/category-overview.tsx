"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { ProductImage } from "./product-image";
import { useCatalog } from "./catalog-provider";
import { categoryNames } from "@/lib/product-model";
export function CategoryOverview() {
  const { products } = useCatalog();
  const categories = Object.entries(categoryNames).filter(([slug]) => products.some(product => product.category === slug));
  return <section className="category-overview"><div className="section-heading"><div><span className="eyebrow">O QUE VOCÊ QUER COMPARAR?</span><h2>Comece pela categoria.</h2></div><Link href="/catalogo" className="section-link">Explorar tudo <UiIcon name="right" /></Link></div><div className="category-grid">{categories.map(([slug, name]) => {
    const items = products.filter(product => product.category === slug);
    const representative = items.find(product => product.imageUrl);
    return <Link key={slug} href={`/catalogo?categoria=${slug}`}><ProductImage name={name} url={representative?.imageUrl ?? null} /><strong>{name}<span aria-hidden="true"><UiIcon name="external" /></span></strong><small>{items.length} produtos</small></Link>;
  })}</div></section>;
}
