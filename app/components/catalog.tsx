"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import { useCatalog } from "./catalog-provider";
import { LibraryButton } from "./user-actions";
import { ReactionCounters } from "./reactions";
import { ProductScore } from "./product-score";
import { ProductImage } from "./product-image";
import { categoryNames, money, type Product } from "@/lib/product-model";

export function LoadState() {
  const { status, retry } = useCatalog();
  if (status === "loading") return <p className="empty" role="status">Carregando produtos…</p>;
  if (status === "error") return <div className="empty" role="alert"><p>Não foi possível carregar o catálogo.</p><button className="button secondary" onClick={retry}>Tentar novamente</button></div>;
  return null;
}
export function ProductCard({ product }: { product: Product }) {
  const { selected, toggle } = useCatalog();
  return <article className="product-card"><div className="product-art-wrapper"><div className="card-social-bar"><ReactionCounters productId={product.id} /><LibraryButton kind="likedProducts" productIds={[product.id]} compact /></div><ProductScore productId={product.id} /><Link className="product-art" href={`/produto/${product.id}`} aria-label={`Ver ${product.name}`}><ProductImage name={product.name} url={product.imageUrl} /><span className="category-tag">{categoryNames[product.category] ?? product.category}</span></Link></div><div className="product-content"><span className="brand-name">{product.brand}</span><h3><Link href={`/produto/${product.id}`}>{product.name}</Link></h3><p className="card-summary">{product.specs.length ? `${product.specs.length} especificações para conferir` : "Consulte as ofertas disponíveis"}</p><div className="price"><small>{product.price === null ? "Ofertas" : "A partir de"}</small><strong>{product.price === null ? "Consultar na loja" : money(product.price)}</strong></div><div className="card-actions"><Link className="button secondary" href={`/produto/${product.id}`}>Ver produto <UiIcon name="external" /></Link><button className={`compare-button ${selected.includes(product.id) ? "chosen" : ""}`} aria-pressed={selected.includes(product.id)} onClick={() => toggle(product)}><UiIcon name={selected.includes(product.id) ? "check" : "add"} />{selected.includes(product.id) ? "Selecionado" : "Comparar"}</button></div></div></article>;
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function Catalog({ defaultCategory = "todas", home = false }: { defaultCategory?: string; home?: boolean }) {
  const { products, status, selected, message } = useCatalog();
  const [category, setCategory] = useState(defaultCategory);
  const [brand, setBrand] = useState("Todas");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState(home ? "featured" : "name");
  const [visible, setVisible] = useState(home ? 6 : 12);
  const categories = [...new Set(products.map(product => product.category))].sort();
  const categoryProducts = products.filter(product => category === "todas" || product.category === category);
  const brands = [...new Set(categoryProducts.map(product => product.brand))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const filtered = categoryProducts.filter(product => (brand === "Todas" || product.brand === brand) && normalize(`${product.name} ${product.brand}`).includes(normalize(search))).sort((a, b) => sort === "price" ? (a.price ?? Infinity) - (b.price ?? Infinity) : a.name.localeCompare(b.name, "pt-BR"));
  const displayProducts = sort === "featured" ? (() => {
    const queues = [...new Set(filtered.map(product => product.category))].map(item => filtered.filter(product => product.category === item));
    const result: Product[] = [];
    while (queues.some(queue => queue.length)) for (const queue of queues) { const product = queue.shift(); if (product) result.push(product); }
    return result;
  })() : filtered;
  return <section id="catalogo" className="catalog"><div className="section-heading"><div><span className="eyebrow">{home ? "PRODUTOS PARA TODAS AS ESCOLHAS" : "EXPLORE E COMPARE"}</span><h2>{home ? "Escolha com todos os detalhes." : defaultCategory === "celulares" ? "Celulares" : "Todos os produtos"}</h2></div>{home && <Link className="section-link" href="/catalogo">Ver todos os produtos <UiIcon name="right" /></Link>}</div><div className="filters"><label className="search"><span aria-hidden="true"><UiIcon name="search" /></span><input aria-label="Buscar produto" placeholder="Busque por nome ou marca…" value={search} onChange={event => { setSearch(event.target.value); setVisible(12); }} /></label>{defaultCategory !== "celulares" && <label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setBrand("Todas"); setVisible(12); }}><option value="todas">Todas as categorias</option>{categories.map(item => <option key={item} value={item}>{categoryNames[item] ?? item}</option>)}</select></label>}<label>Marca<select value={brand} onChange={event => { setBrand(event.target.value); setVisible(12); }}><option>Todas</option>{brands.map(item => <option key={item}>{item}</option>)}</select></label><label>Ordenar<select value={sort} onChange={event => setSort(event.target.value)}>{home && <option value="featured">Categorias variadas</option>}<option value="name">Nome: A–Z</option><option value="price">Menor preço</option></select></label></div><div className="catalog-meta"><span>{status === "ready" ? `${filtered.length} produtos encontrados` : "Consultando catálogo…"}</span>{selected.length > 0 && <span>{selected.length}/2 selecionados</span>}</div><p className="selection-message" role="status">{message}</p><LoadState /><div className="product-grid">{displayProducts.slice(0, visible).map(product => <ProductCard product={product} key={product.id} />)}</div>{status === "ready" && !filtered.length && <p className="empty">Nenhum produto encontrado. Tente outro nome ou filtro.</p>}{filtered.length > visible && <div className="load-more"><button className="button secondary" onClick={() => setVisible(value => value + 12)}>Mostrar mais produtos ({filtered.length - visible})</button></div>}</section>;
}
