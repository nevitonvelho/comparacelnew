"use client";

import Image from "next/image";
import { useState } from "react";
import { useCatalog } from "./catalog-provider";

const categories = [
  { slug: "notebooks", name: "Notebooks" },
  { slug: "televisoes", name: "Televisões" },
  { slug: "fones-de-ouvido", name: "Fones de ouvido" },
  { slug: "cafeteiras", name: "Cafeteiras" },
];

function CategoryPhoto({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  return <span className="hero-category-photo">
    {url && !failed ? <Image src={url} alt="" fill sizes="160px" loading="eager" style={{ objectFit: "contain" }} onError={() => setFailed(true)} /> : <span className="hero-photo-placeholder">{failed ? "Foto indisponível" : ""}</span>}
  </span>;
}

export function HeroCategories() {
  const { products } = useCatalog();
  return <div className="hero-categories">{categories.map(category => {
    const product = products.find(item => item.category === category.slug && item.imageUrl);
    return <div key={category.slug}><CategoryPhoto key={product?.imageUrl ?? category.slug} url={product?.imageUrl ?? null} /><strong>{category.name}</strong></div>;
  })}</div>;
}
