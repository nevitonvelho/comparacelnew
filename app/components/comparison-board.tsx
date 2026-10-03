"use client";
import { UiIcon } from "./icons";

import Link from "next/link";
import { Reactions } from "./reactions";
import { ProductScore } from "./product-score";
import { PageEngagement } from "./engagement";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { comparisonRows, comparisonSection, comparisonSlug, money, type Product } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { LibraryButton } from "./user-actions";
import { ProductImage } from "./product-image";

type Row = ReturnType<typeof comparisonRows>[number];
const sectionOrder = ["Design e dimensões", "Tela e imagem", "Desempenho e armazenamento", "Câmeras", "Conectividade", "Bateria e energia", "Software", "Recursos e funções", "Outras especificações"];
const shortName = (product: Product) => product.name.split(" - ")[0];

export function ComparisonBoard({ a, b, shared }: { a: Product; b: Product; shared: boolean }) {
  const router = useRouter();
  const { products, setPair } = useCatalog();
  const [onlyDifferent, setOnlyDifferent] = useState(false);
  const [active, setActive] = useState("resumo");
  const [shareStatus, setShareStatus] = useState("");
  const [shareFallback, setShareFallback] = useState("");
  const rows = comparisonRows(a, b).map(row => ({ ...row, section: comparisonSection(row) }));
  const sections = [...new Set(rows.map(row => row.section))].sort((x, y) => {
    const left = sectionOrder.indexOf(x), right = sectionOrder.indexOf(y);
    return (left < 0 ? 99 : left) - (right < 0 ? 99 : right) || x.localeCompare(y, "pt-BR");
  });
  const options = products.filter(product => product.category === a.category);
  const differenceCount = rows.filter(row => row.a !== row.b).length;
  function replace(index: number, id: string) {
    const pair = [a.id, b.id]; pair[index] = id;
    if (pair[0] === pair[1]) return;
    setPair(pair);
    if (shared) router.push(`/comparar/${comparisonSlug(pair)}`, { scroll: false });
  }
  async function share() {
    const url = `${window.location.origin}/comparar/${comparisonSlug([a.id, b.id])}`;
    try { await navigator.clipboard.writeText(url); setShareStatus("Link copiado!"); setShareFallback(""); }
    catch { setShareFallback(url); setShareStatus("Copie o link abaixo para compartilhar."); }
  }
  const nav = [{ id: "resumo", name: "Visão geral", count: null }, ...sections.map((name, index) => ({ id: `ficha-${index}`, name, count: rows.filter(row => row.section === name).length })), { id: "ofertas", name: "Preços e ofertas", count: null }];
  return <div className="compare-workspace"><aside className="compare-sidebar"><span className="eyebrow">NESTA COMPARAÇÃO</span><nav aria-label="Seções da comparação">{nav.map(item => <a key={item.id} href={`#${item.id}`} className={active === item.id ? "active" : ""} onClick={() => setActive(item.id)}>{item.name}{item.count !== null && <small>{item.count}</small>}</a>)}</nav><div className="compare-legend"><span className="legend-dot" /> Vantagem técnica conforme o critério cadastrado.</div></aside><div className="compare-content"><div className="compare-toolbar"><div><span className="comparison-category">COMPARAÇÃO DE PRODUTOS</span><strong>{differenceCount} diferenças nas fichas</strong></div><div className="comparison-account-actions"><LibraryButton kind="likedComparisons" productIds={[a.id,b.id]} /><LibraryButton kind="savedComparisons" productIds={[a.id,b.id]} /><button className="button secondary" onClick={share}>Compartilhar <UiIcon name="share" /></button></div></div><PageEngagement kind="comparison" productIds={[a.id,b.id]} /><p className="share-status" role="status">{shareStatus}</p>{shareFallback && <input className="share-url" readOnly value={shareFallback} aria-label="Link da comparação" onFocus={event => event.currentTarget.select()} />}<section id="resumo" className="comparison-overview"><div className="compare-grid compare-card-grid"><div className="compare-overview-label"><span className="eyebrow">VISÃO GERAL</span><h2>Seus favoritos.<br />Lado a lado.</h2><p>Compare especificações e ofertas para decidir o que vale mais para você.</p><span className="overview-vs">VS</span></div>{[a,b].map((product, index) => <article className="compare-product" key={product.id}><label className="change-product">Trocar produto {index + 1}<select aria-label={`Trocar produto ${index + 1}`} value={product.id} onChange={event => replace(index, event.target.value)}>{options.filter(item => item.id !== (index === 0 ? b.id : a.id)).map(item => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label><ProductImage name={product.name} url={product.imageUrl} /><span className="brand-name">{product.brand}</span><h2 title={product.name}><Link href={`/produto/${product.id}`}>{shortName(product)}</Link></h2><span className="product-data-count">{product.specs.length} especificações cadastradas</span><div className="compare-price"><small>A partir de</small><strong>{product.price === null ? "Consultar preço" : money(product.price)}</strong>{a.price !== null && b.price !== null && product.price !== null && product.price < (index === 0 ? b.price! : a.price!) && <span className="lowest-price">Menor preço cadastrado</span>}</div><div className="compare-product-index"><ProductScore productId={product.id} /><span>Índice Comparacel</span></div><Reactions kind="product" productIds={[product.id]} compact readOnly /><Link className="button primary" href="#ofertas" onClick={() => setActive("ofertas")}>Ver ofertas <UiIcon name="down" /></Link><Link href={`/produto/${product.id}`} className="section-link">Ver ficha e ofertas <UiIcon name="external" /></Link></article>)}</div><div className="compare-grid quick-row"><strong>Nota geral</strong>{[a,b].map(product => <div key={product.id}>{product.score !== "—" && product.score !== "0,0" ? <span className="score-badge">{product.score}<small>/ 10</small></span> : <span className="muted">Sem nota cadastrada</span>}</div>)}</div><div className="compare-grid quick-row"><strong>Destaques</strong>{[a,b].map(product => <div key={product.id}>{product.highlights.some(item => item.kind === "pro") ? <ul>{product.highlights.filter(item => item.kind === "pro").slice(0,3).map((item,index) => <li key={index}>{item.text}</li>)}</ul> : <span className="muted">Sem destaques cadastrados</span>}</div>)}</div></section><div className="compare-sticky"><span>Ficha técnica</span>{[a,b].map(product => <Link href={`/produto/${product.id}`} key={product.id} title={product.name}>{shortName(product)}</Link>)}</div><div className="compare-controls"><div><h2>O que muda entre eles?</h2><p>“—” indica informação ausente no cadastro.</p></div><label><input type="checkbox" checked={onlyDifferent} onChange={event => setOnlyDifferent(event.target.checked)} /> Mostrar só diferenças</label></div>{sections.map((section,index) => {
    const sectionRows = rows.filter(row => row.section === section && (!onlyDifferent || row.a !== row.b));
    return <section className="compare-spec-section" id={`ficha-${index}`} key={section}><div className="compare-section-title"><span>{String(index + 1).padStart(2,"0")}</span><h2>{section}</h2><small>{sectionRows.length} características</small></div>{sectionRows.length > 0 ? <table className="compare-spec-table"><caption className="sr-only">{section}: {a.name} e {b.name}</caption><colgroup><col className="compare-label-col" /><col /><col /></colgroup><thead className="sr-only"><tr><th scope="col">Especificação</th><th scope="col">{a.name}</th><th scope="col">{b.name}</th></tr></thead><tbody>{sectionRows.map(row => <SpecRow key={row.key} row={row} />)}</tbody></table> : <p className="section-empty">Nenhuma diferença cadastrada nesta seção.</p>}</section>;
  })}{!rows.length && <p className="empty">As fichas técnicas destes produtos ainda não foram cadastradas.</p>}<section id="ofertas" className="compare-offers-section"><div className="compare-section-title"><span><UiIcon name="external" /></span><h2>Preços e ofertas</h2></div><p>Preços importados. Confirme o valor e a disponibilidade na loja.</p><div className="compare-grid offers-grid"><div className="offers-label"><strong>Onde comprar</strong><p>Veja as ofertas de cada produto.</p></div>{[a,b].map(product => <div className="product-offers" key={product.id}><h3>{shortName(product)}</h3>{product.offers.filter(offer => offer.available && offer.url).sort((x,y) => (x.price ?? Infinity)-(y.price ?? Infinity)).map(offer => <a key={offer.id} href={offer.url!} target="_blank" rel="noopener noreferrer sponsored" className="compare-store"><span>{offer.store}</span><strong>{offer.price === null ? "Consultar preço" : money(offer.price)}</strong><small>Ir à loja <UiIcon name="external" /></small></a>)}{!product.offers.some(offer => offer.available && offer.url) && <p>Sem ofertas disponíveis.</p>}</div>)}</div></section><p className="compare-footnote">A comparação mostra os dados cadastrados de cada produto. Valores em verde indicam uma vantagem apenas quando existe um critério técnico definido para essa característica.</p></div></div>;
}
function SpecRow({ row }: { row: Row }) {
  return <tr className={row.a !== row.b ? "different-row" : ""}><th scope="row">{row.name}</th><td className={row.winner === "a" ? "better" : ""}>{row.a}{row.winner === "a" && <span className="sr-only"> — vantagem pelo critério cadastrado</span>}</td><td className={row.winner === "b" ? "better" : ""}>{row.b}{row.winner === "b" && <span className="sr-only"> — vantagem pelo critério cadastrado</span>}</td></tr>;
}
