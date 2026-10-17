"use client";
import Link from "next/link";
import { AffiliateLink, AffiliateDisclosure } from "./affiliate-link";
import { purchaseOffers, lowestOfferPrice } from "@/lib/product-offers";
import { PriceUpdated } from "./price-updated";
import { PriceHistoryChart } from "./price-history-chart";
import type { PriceHistoryPoint } from "@/lib/price-history";
import { StoreIdentity } from "./store-identity";
import { UiIcon } from "./icons";
import { ProductScore } from "./product-score";
import { Reactions } from "./reactions";
import { PageEngagement } from "./engagement";
import type { Product } from "@/lib/product-model";
import { money, comparisonSlug } from "@/lib/product-model";
import { useCatalog } from "./catalog-provider";
import { LoadState } from "./catalog";
import { LibraryButton } from "./user-actions";
import { ProductImage } from "./product-image";

export function ProductDetail({ slug, product: serverProduct, history = [], historyUnavailable = false }: { slug: string; product?: Product; history?: PriceHistoryPoint[]; historyUnavailable?: boolean }) {
  const { products, categoryNames, selected, toggle, status, message } = useCatalog();
  const product = serverProduct ?? products.find(item => item.id === slug);
  if (!serverProduct && status !== "ready") return <main id="conteudo"><LoadState variant="product" /></main>;
  if (!product) return <main id="conteudo" className="empty"><h1>Produto não encontrado</h1><Link href="/catalogo">Voltar ao catálogo <UiIcon name="right" /></Link></main>;
  const offers = purchaseOffers(product);
  const bestOffer = offers[0];
  const lowestPrice = lowestOfferPrice(offers);
  const knownPriceCount = offers.filter(offer => offer.price !== null).length;
  const pros = product.highlights.filter(item => item.kind === "pro");
  const cons = product.highlights.filter(item => item.kind === "con");
  const alternatives = products.filter(item => item.category === product.category && item.id !== product.id).sort((a, b) => Number(b.brand === product.brand) - Number(a.brand === product.brand)).slice(0, 4);
  const description = product.description?.trim() ?? "";
  const compactDescription = description.replace(/\s+/g, " ");
  const hasFullDescription = compactDescription.length > 240;
  const descriptionPreview = hasFullDescription ? `${compactDescription.slice(0, 240).replace(/\s+\S*$/, "")}…` : compactDescription;
  const groups = [...new Set(product.specs.map(spec => spec.group))];

  return <main id="conteudo">
    <div className="breadcrumbs"><Link href="/">Início</Link><span>/</span><Link href={`/${product.category}`}>{categoryNames[product.category] ?? "Catálogo"}</Link><span>/</span><span>Produto</span></div>
    <section className="detail-hero">
      <div className="detail-media">
        <div className="detail-photo"><ProductImage name={product.name} url={product.imageUrl} large /></div>
        <PriceHistoryChart points={history} unavailable={historyUnavailable} stores={product.offers.map(offer => ({ id: String(offer.storeId ?? offer.id), name: offer.store }))} />
      </div>
      <div>
        <span className="eyebrow">{product.brand}</span>
        <h1 data-analytics-view="product_view" data-product-id={product.id} data-product-name={product.name}>{product.name}</h1>
        <PriceUpdated kind="product" dates={[product.updatedAt]} />
        <p>{categoryNames[product.category] ?? product.category}</p>
        {description && <p className="product-description-preview">{descriptionPreview}</p>}
        {Boolean(product.seoTags?.length) && <ul className="seo-topic-tags" aria-label="Temas do produto">{product.seoTags!.map(tag => <li key={tag}>{tag}</li>)}</ul>}
        <div className="price">
          <small>{lowestPrice === null ? "Ofertas disponíveis" : "Menor preço cadastrado"}</small>
          <strong>{lowestPrice === null ? "Consultar na loja" : money(lowestPrice)}</strong>
          {bestOffer && <><small>{bestOffer.store}{bestOffer.priceCondition === "pix" ? " · No Pix" : ""}</small><PriceUpdated dates={[bestOffer.priceUpdatedAt]} /></>}
        </div>
        <div className="detail-purchase-actions">
          {bestOffer && <AffiliateLink product={product} offer={bestOffer} position="product_hero" />}
          <a className="button secondary" href="#ofertas-produto">{offers.length ? `Comparar ofertas (${offers.length})` : "Ver opções de compra"}<UiIcon name="down" /></a>
        </div>
        <p className="purchase-note">A compra é feita no site da loja. Confira o preço final e o frete antes de decidir.</p>
        <nav className="product-section-nav" aria-label="Informações do produto"><a href="#decisao-produto">Vantagens e cuidados</a><a href="#ficha-produto">Ficha técnica</a><a href="#duvidas-produto">Dúvidas frequentes</a></nav>
        <button className={`button secondary ${selected.includes(product.id) ? "chosen" : ""}`} onClick={() => toggle(product)}><UiIcon name={selected.includes(product.id) ? "check" : "add"} />{selected.includes(product.id) ? "Remover da comparação" : "Adicionar à comparação"}</button>
        <LibraryButton kind="likedProducts" productIds={[product.id]} />
        <ProductScore productId={product.id} explain />
        <PageEngagement kind="product" productIds={[product.id]} />
        <Reactions kind="product" productIds={[product.id]} />
        <p role="status" className="selection-message">{message}</p>
      </div>
    </section>
    {hasFullDescription && <details className="product-description-full"><summary>Ver descrição completa</summary><div className="product-description">{description}</div></details>}
    <section id="ofertas-produto" className="offers">
      <span className="eyebrow">COMPARE AS LOJAS</span><h2>Onde comprar {product.name}</h2>
      <p className="offers-intro">Compare as ofertas do menor para o maior preço e escolha onde comprar.</p>
      <aside className="offer-verification" aria-label="Confira o produto no anúncio">
        <span className="offer-verification-icon" aria-hidden="true"><UiIcon name="check" /></span>
        <div><strong>Confira se é o produto certo para você</strong><p>Antes de comparar ou comprar, confira o modelo, a versão, a voltagem, as medidas e as características no anúncio da loja. Informações, imagens e especificações podem mudar ou apresentar diferenças entre anúncios. Confirme também o preço final, o frete e as condições de pagamento.</p></div>
      </aside>
      <AffiliateDisclosure />
      {offers.map(offer => <div className={`offer ${offer.price !== null && offer.price === lowestPrice ? "offer-best" : ""}`} key={offer.id}>
        <div>
          <StoreIdentity name={offer.store} /><PriceUpdated dates={[offer.priceUpdatedAt]} />
          {knownPriceCount > 1 && offer.price !== null && offer.price === lowestPrice && <small className="offer-badge">Menor preço cadastrado</small>}
        </div>
        <div className="offer-price">
          <strong>{offer.price === null ? "Consultar preço" : money(offer.price)}</strong>
          {offer.priceCondition === "pix" && <small className="price-updated">No Pix</small>}
          {lowestPrice !== null && offer.price !== null && offer.price > lowestPrice && <small className="offer-difference">{money(offer.price - lowestPrice)} acima do menor preço</small>}
        </div>
        <AffiliateLink product={product} offer={offer} position="product_offers" />
      </div>)}
      {!offers.length && <p>Sem ofertas disponíveis no momento. Explore os produtos semelhantes abaixo.</p>}
    </section>
    <section id="decisao-produto" className="purchase-guide">
      <h2>O que considerar antes de comprar</h2>
      {(pros.length > 0 || cons.length > 0) && <div className="highlights">
        {pros.length > 0 && <div><h3>Principais vantagens</h3><ul>{pros.map((item, index) => <li key={index}>{item.text}</li>)}</ul></div>}
        {cons.length > 0 && <div><h3>Pontos de atenção</h3><ul>{cons.map((item, index) => <li key={index}>{item.text}</li>)}</ul></div>}
      </div>}
      <div className="purchase-fit">
        <h3>Para quem vale a pena?</h3>
        <p>{pros.length ? "Considere este produto se os destaques cadastrados abaixo atendem ao que você procura:" : "Confira se os recursos da ficha técnica atendem ao seu uso e compare com outras opções da mesma categoria."}</p>
        {pros.length > 0 && <ul>{pros.slice(0, 3).map((item, index) => <li key={index}>{item.text}</li>)}</ul>}
        <p>Antes de escolher, confira a versão do produto no anúncio, as condições de pagamento, o frete e a garantia oferecida pela loja.</p>
      </div>
    </section>
    <section id="ficha-produto" className="specs-section">
      <h2>Ficha técnica completa</h2>
      {!groups.length && <p>A ficha técnica deste produto ainda não foi cadastrada.</p>}
      {groups.map(group => <div className="spec-group" key={group}><h3>{group}</h3><dl>{product.specs.filter(spec => spec.group === group).sort((a, b) => a.order - b.order).map(spec => <div key={spec.key}><dt>{spec.name}</dt><dd>{spec.display}</dd></div>)}</dl></div>)}
    </section>
    {alternatives.length > 0 && <section className="product-alternatives">
      <div className="section-heading"><div><span className="eyebrow">CONTINUE SUA PESQUISA</span><h2>Compare com outras opções</h2><p>Confira diferenças de ficha técnica e ofertas na mesma categoria.</p></div><Link className="section-link" href={`/${product.category}`}>Ver categoria <UiIcon name="right" /></Link></div>
      <div className="product-alternatives-grid">{alternatives.map(item => <article key={item.id}>
        <Link className="alternative-product" href={`/produto/${item.id}`}><ProductImage name={item.name} url={item.imageUrl} sizes="90px" /><div><small>{item.brand}</small><h3>{item.name}</h3><strong>{item.price === null ? "Consultar preço" : money(item.price)}</strong></div></Link>
        <Link className="button secondary" href={`/comparar/${comparisonSlug([product.id, item.id])}`}>Comparar com este produto <UiIcon name="compare" /></Link>
      </article>)}</div>
    </section>}
    <section id="duvidas-produto" className="product-faq">
      <h2>Perguntas frequentes</h2>
      <details><summary>Onde conferir o preço de {product.name}?</summary><p>{offers.length ? "Compare as ofertas cadastradas acima e abra o site da loja para confirmar o preço final, o frete e a disponibilidade." : "Ainda não há ofertas disponíveis para este produto. Você pode consultar outras opções na mesma categoria."}</p></details>
      <details><summary>O menor preço inclui frete e parcelamento?</summary><p>Não. Comparamos os preços cadastrados das ofertas. O frete depende do endereço de entrega, e as condições de pagamento devem ser confirmadas na loja. Ofertas com preço no Pix estão identificadas.</p></details>
      <details><summary>O Comparacel vende ou entrega os produtos?</summary><p>O Comparacel ajuda a comparar produtos e ofertas. A compra, o pagamento, a entrega e o atendimento são de responsabilidade da loja escolhida. Podemos receber uma comissão por compras feitas pelos links de afiliados.</p></details>
    </section>
    {bestOffer && <aside className="mobile-offer-bar" aria-label="Oferta deste produto"><div><small>{bestOffer.store}{bestOffer.priceCondition === "pix" ? " · Pix" : ""}</small><strong>{bestOffer.price === null ? "Consultar preço" : money(bestOffer.price)}</strong></div><AffiliateLink product={product} offer={bestOffer} position="product_mobile_bar" /></aside>}
  </main>;
}
