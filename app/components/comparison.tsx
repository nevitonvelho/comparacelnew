"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import { comparisonSlug } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { LoadState } from "./catalog";
import { ComparisonProductPicker } from "./comparison-product-picker";
import { ComparisonBoard } from "./comparison-board";
export function Comparison({ slug }: { slug?: string }) {
  const { categoryNames, products, selected, choose, setPair, status, clear, message } = useCatalog();
  const [category, setCategory] = useState("celulares");
  const ids = slug ? slug.split("-vs-") : selected;
  const a = products.find(product => product.id === ids[0]);
  const b = products.find(product => product.id === ids[1]);
  if (status !== "ready") return <main id="conteudo"><LoadState /></main>;
  if (slug && (ids.length !== 2 || !a || !b || a.id === b.id || a.category !== b.category)) return <main id="conteudo" className="empty"><h1>Comparação indisponível</h1><p>Escolha dois produtos diferentes da mesma categoria.</p><Link className="button primary" href="/comparar">Escolher produtos <UiIcon name="right" /></Link></main>;
  const comparisonCategory = a?.category ?? (products.some(product=>product.category===category)?category:products[0]?.category??category);
  const choices = products.filter(product => product.category === comparisonCategory);
  return <main id="conteudo" className="comparison-page"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Comparar produtos</span></div><div className="section-heading"><div><span className="eyebrow">LADO A LADO</span><h1>{a && b ? `${categoryNames[a.category] ?? "Produtos"}: comparação` : "O que você quer comparar?"}</h1></div>{slug && <Link className="button secondary" href="/comparar" onClick={() => setPair(ids)}>Trocar produtos</Link>}</div>{!slug && <section className="comparison-builder"><div className="compare-builder-toolbar"><div><h2>Monte sua comparação</h2><p>Escolha dois produtos e confira preços, características e diferenças.</p></div><label>O que você quer comparar?<select value={comparisonCategory} onChange={event=>{clear();setCategory(event.target.value);}}>{[...new Set(products.map(product=>product.category))].sort().map(item=><option key={item} value={item}>{categoryNames[item]??item}</option>)}</select></label></div><div className="compare-builder-grid">{[0,1].map(index=><ComparisonProductPicker key={`${comparisonCategory}-${index}-${selected[index]??"empty"}`} index={index} disabled={index===1&&!a} product={index===0?a:b} choices={choices.filter(product=>!selected.includes(product.id)||product.id===selected[index])} onChoose={id=>choose(index,id)}/>)}<span className="compare-versus" aria-hidden="true">VS</span></div><div className="compare-builder-footer"><div><strong>{selected.length===2?"Sua comparação está pronta":`${selected.length} de 2 produtos selecionados`}</strong><p role="status">{message || (selected.length===2?"Veja os detalhes lado a lado e encontre a melhor opção para você.":"Selecione os produtos acima para começar.")}</p></div><div className="picker-actions">{selected.length>0&&<button className="text-button" onClick={clear}>Limpar seleção</button>}<Link className={`button primary ${selected.length!==2?"disabled":""}`} aria-disabled={selected.length!==2} href={selected.length===2?`/comparar/${comparisonSlug(selected)}`:"/comparar"}>Comparar produtos <UiIcon name="right"/></Link></div></div></section>}{slug && a && b && <ComparisonBoard a={a} b={b} shared={Boolean(slug)} />}</main>;
}
