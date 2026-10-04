"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import { comparisonSlug } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { LoadState } from "./catalog";
import { ComparisonBoard } from "./comparison-board";
export function Comparison({ slug }: { slug?: string }) {
  const { categoryNames, products, selected, toggle, choose, setPair, status, clear, message } = useCatalog();
  const [category, setCategory] = useState("celulares");
  const ids = slug ? slug.split("-vs-") : selected;
  const a = products.find(product => product.id === ids[0]);
  const b = products.find(product => product.id === ids[1]);
  if (status !== "ready") return <main id="conteudo"><LoadState /></main>;
  if (slug && (ids.length !== 2 || !a || !b || a.id === b.id || a.category !== b.category)) return <main id="conteudo" className="empty"><h1>Comparação indisponível</h1><p>Escolha dois produtos diferentes da mesma categoria.</p><Link className="button primary" href="/comparar">Escolher produtos <UiIcon name="right" /></Link></main>;
  const comparisonCategory = a?.category ?? category;
  const choices = products.filter(product => product.category === comparisonCategory);
  return <main id="conteudo" className="comparison-page"><div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><span>Comparar produtos</span></div><div className="section-heading"><div><span className="eyebrow">LADO A LADO</span><h1>{a && b ? `${categoryNames[a.category] ?? "Produtos"}: comparação` : "O que você quer comparar?"}</h1></div>{slug && <Link className="button secondary" href="/comparar" onClick={() => setPair(ids)}>Trocar produtos</Link>}</div>{!slug && <section className="comparison-picker"><p>Escolha dois produtos da mesma categoria. Sua seleção fica salva enquanto você navega.</p>{!selected.length && <label>Categoria<select value={category} onChange={event => setCategory(event.target.value)}>{[...new Set(products.map(product => product.category))].sort().map(item => <option key={item} value={item}>{categoryNames[item] ?? item}</option>)}</select></label>}<div className="picker-grid">{[0, 1].map(index => <label key={index}>Produto {index + 1}<select aria-label={`Produto ${index + 1}`} value={selected[index] ?? ""} onChange={event => choose(index, event.target.value)}><option value="">Escolha um produto</option>{choices.filter(product => !selected.includes(product.id) || product.id === selected[index]).map(product => <option key={product.id} value={product.id}>{product.name}</option>)}</select>{selected[index] && <button className="text-button" onClick={() => { const product = products.find(item => item.id === selected[index]); if (product) toggle(product); }}>Remover produto</button>}</label>)}</div><p className="selection-message" role="status">{message}</p><div className="picker-actions"><Link className={`button primary ${selected.length !== 2 ? "disabled" : ""}`} aria-disabled={selected.length !== 2} href={selected.length === 2 ? `/comparar/${comparisonSlug(selected)}` : "/comparar"}>Ver comparação completa <UiIcon name="right" /></Link>{selected.length > 0 && <button className="text-button" onClick={clear}>Limpar seleção</button>}</div></section>}{a && b && <ComparisonBoard a={a} b={b} shared={Boolean(slug)} />}</main>;
}
