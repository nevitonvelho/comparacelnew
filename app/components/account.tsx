"use client";
import { AdminLink } from "./admin-link";
import { UiIcon } from "./icons";
import Link from "next/link";
import { useState } from "react";
import { useAuth, authError } from "./auth-provider";
import { useLibrary, type LibraryKind } from "./library-provider";
import { useCatalog } from "./catalog-provider";
import { ProductCard } from "./catalog";
import { AuthControl, LibraryButton } from "./user-actions";
import { ProductImage } from "./product-image";
export function Account() {
  const { user, loading: authLoading, logout } = useAuth();
  const { items, loading, error } = useLibrary();
  const { products, status, retry } = useCatalog();
  const [tab, setTab] = useState<LibraryKind>("savedComparisons");
  const [message, setMessage] = useState("");
  if (authLoading) return <main id="conteudo"><p className="empty" role="status">Carregando sua conta…</p></main>;
  if (!user) return <main id="conteudo" className="account-intro"><span className="eyebrow">SUAS ESCOLHAS EM UM SÓ LUGAR</span><h1>Guarde seus favoritos.<br /><em>Volte quando quiser.</em></h1><p>Entre com Google para salvar comparações e marcar os produtos e comparações de que você gosta.</p><AuthControl /></main>;
  const content = items[tab];
  return <main id="conteudo" className="account-page"><div className="section-heading"><div><span className="eyebrow">MINHA CONTA</span><h1>Olá, {user.displayName?.split(" ")[0] ?? "bem-vindo"}.</h1><p>Suas comparações e seus favoritos ficam guardados na sua conta.</p></div><button className="button secondary" onClick={async () => { try { await logout(); } catch (error) { setMessage(authError(error)); } }}>Sair da conta</button></div>{message && <p role="alert">{message}</p>}<AdminLink /><div className="account-tabs" role="group" aria-label="Itens da minha conta">{([["savedComparisons", "Comparações salvas"], ["likedProducts", "Produtos favoritos"], ["likedComparisons", "Comparações favoritas"]] as const).map(([kind,label]) => <button key={kind} className={tab === kind ? "active" : ""} aria-pressed={tab === kind} onClick={() => setTab(kind)}>{label}<span>{items[kind].length}</span></button>)}</div>{error ? <p className="empty" role="alert">Não foi possível carregar seus itens. Atualize a página para tentar novamente.</p> : loading || status === "loading" ? <p className="empty" role="status">Carregando seus itens…</p> : status === "error" ? <div className="empty"><p>Não foi possível carregar os produtos.</p><button className="button secondary" onClick={retry}>Tentar novamente</button></div> : !content.length ? <div className="account-empty"><h2>{tab === "savedComparisons" ? "Suas próximas comparações começam aqui." : "Encontre seus favoritos."}</h2><p>Use os botões de salvar ou favoritar enquanto explora o site.</p><Link href="/catalogo" className="button primary">Explorar produtos <UiIcon name="right" /></Link></div> : tab === "likedProducts" ? <div className="product-grid">{content.map(item => { const product = products.find(product => product.id === item.productIds[0]); return product ? <ProductCard key={item.id} product={product} /> : <div className="unavailable-item" key={item.id}><p>Este produto não está mais disponível.</p><LibraryButton kind="likedProducts" productIds={item.productIds} /></div>; })}</div> : <div className="saved-grid">{content.map(item => {
    const pair = item.productIds.map(id => products.find(product => product.id === id));
    return <article className="saved-comparison" key={item.id}><div className="saved-photos">{pair.map((product,index) => <div key={index}>{product && <ProductImage name={product.name} url={product.imageUrl} />}</div>)}</div><div className="saved-names">{pair.map((product,index) => <strong key={index}>{product?.name ?? "Produto indisponível"}</strong>)}</div><div className="saved-actions">{pair.every(Boolean) && <Link className="button primary" href={`/comparar/${item.id}`}>Abrir comparação <UiIcon name="right" /></Link>}<LibraryButton kind={tab} productIds={item.productIds} /></div></article>;
  })}</div>}</main>;
}
