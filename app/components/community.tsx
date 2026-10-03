"use client";
import Link from "next/link";
import { useState } from "react";
import { PopularComparisons } from "./popular-comparisons";
import { UiIcon } from "./icons";
import { categoryNames } from "@/lib/product-model";

export function Community() {
  const [category, setCategory] = useState("todas");
  return <main id="conteudo" className="community-page">
    <section className="community-intro">
      <div><span className="eyebrow">MAIS COMPARADOS</span><h1>O que o pessoal<br /><em>está comparando?</em></h1><p>Descubra os pares mais acessados nos últimos 7 dias. Cada comparação contribui automaticamente para esta lista.</p></div>
      <Link className="button primary" href="/comparar">Fazer uma comparação <UiIcon name="right" /></Link>
    </section>
    <div className="community-layout">
      <aside className="community-sidebar"><h2>Explore por categoria</h2><label>Categoria<select aria-label="Categoria" value={category} onChange={event => setCategory(event.target.value)}><option value="todas">Todas as categorias</option>{Object.entries(categoryNames).map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}</select></label><div className="community-note"><strong>Compare e descubra.</strong><p>Escolha dois produtos e veja suas diferenças. Sua comparação já entra na contagem, sem precisar de login.</p></div></aside>
      <div className="community-feed"><PopularComparisons category={category} /></div>
    </div>
  </main>;
}
