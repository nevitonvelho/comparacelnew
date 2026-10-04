"use client";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { ProductCard } from "./product-card";
import { HomeProductSections } from "./home-product-sections";
export { ProductCard } from "./product-card";

export function LoadState() {
  const { status, retry } = useCatalog();
  if (status === "loading") return <p className="empty" role="status">Carregando produtos…</p>;
  if (status === "error") return <div className="empty" role="alert"><p>Não foi possível carregar o catálogo.</p><button className="button secondary" onClick={retry}>Tentar novamente</button></div>;
  return null;
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
export function Catalog({ defaultCategory = "todas", defaultBrand = "Todas", defaultSearch = "", home = false }: { defaultCategory?: string; defaultBrand?: string; defaultSearch?: string; home?: boolean }) {
  const { categoryNames, products, status, selected, message } = useCatalog();
  const Heading = home ? "h2" : "h1";
  const [category, setCategory] = useState(defaultCategory);
  const [brand, setBrand] = useState(defaultBrand);
  const [search, setSearch] = useState(defaultSearch);
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
  return <>{home && <HomeProductSections />}<section id="catalogo" className="catalog"><div className="section-heading"><div><span className="eyebrow">{home ? "PRODUTOS PARA TODAS AS ESCOLHAS" : "EXPLORE E COMPARE"}</span><Heading>{home ? "Escolha com todos os detalhes." : defaultBrand !== "Todas" ? `Produtos ${defaultBrand}` : categoryNames[defaultCategory] ?? "Todos os produtos"}</Heading></div>{home && <Link className="section-link" href="/catalogo">Ver todos os produtos <UiIcon name="right" /></Link>}</div><div className="filters"><label className="search"><span aria-hidden="true"><UiIcon name="search" /></span><input aria-label="Buscar produto" placeholder="Busque por nome ou marca…" value={search} onChange={event => { setSearch(event.target.value); setVisible(12); }} /></label>{defaultCategory !== "celulares" && <label>Categoria<select value={category} onChange={event => { setCategory(event.target.value); setBrand("Todas"); setVisible(12); }}><option value="todas">Todas as categorias</option>{categories.map(item => <option key={item} value={item}>{categoryNames[item] ?? item}</option>)}</select></label>}<label>Marca<select value={brand} onChange={event => { setBrand(event.target.value); setVisible(12); }}><option>Todas</option>{brands.map(item => <option key={item}>{item}</option>)}</select></label><label>Ordenar<select value={sort} onChange={event => setSort(event.target.value)}>{home && <option value="featured">Categorias variadas</option>}<option value="name">Nome: A–Z</option><option value="price">Menor preço</option></select></label></div><div className="catalog-meta"><span>{status === "ready" ? `${filtered.length} produtos encontrados` : "Consultando catálogo…"}</span>{selected.length > 0 && <span>{selected.length}/2 selecionados</span>}</div><p className="selection-message" role="status">{message}</p><LoadState /><div className="product-grid">{displayProducts.slice(0, visible).map(product => <ProductCard product={product} key={product.id} />)}</div>{status === "ready" && !filtered.length && <p className="empty">Nenhum produto encontrado. Tente outro nome ou filtro.</p>}{filtered.length > visible && <div className="load-more"><button className="button secondary" onClick={() => setVisible(value => value + 12)}>Mostrar mais produtos ({filtered.length - visible})</button></div>}</section></>;
}
