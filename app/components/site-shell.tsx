"use client";
import { UiIcon } from "./icons";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCatalog } from "./catalog-provider";
import { ProductImage } from "./product-image";
import { AuthControl } from "./user-actions";
import { comparisonSlug } from "@/lib/product-model";

export function Logo() {
  return <Link href="/" className="logo" aria-label="ComparaCel — início"><Image src="/brand/comparacel.png" alt="ComparaCel" fill sizes="250px" style={{ objectFit: "cover" }} preload /></Link>;
}
export function Header() {
  const pathname = usePathname();
  const { selected } = useCatalog();
  return <header className="site-header"><div className="header"><Logo /><nav aria-label="Navegação principal">{[["/", "Início"], ["/catalogo", "Categorias"], ["/comunidade", "Mais comparados"], ["/comparar", "Comparar"]].map(([href, label]) => <Link key={href} href={href} aria-current={pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ? "page" : undefined}>{label}{href === "/comparar" && selected.length > 0 && <span className="nav-count">{selected.length}</span>}</Link>)}</nav><AuthControl /></div></header>;
}
export function Footer() { return <footer><Logo /><p>Uma boa escolha começa com uma boa comparação.</p><small>Preços e especificações sujeitos a atualização.</small></footer>; }
export function ComparisonBar() {
  const { selected, products, toggle, clear, message } = useCatalog();
  const pathname = usePathname();
  const selection = selected.map(id => products.find(product => product.id === id)).filter(product => product !== undefined);
  if (!selection.length || pathname.startsWith("/comparar")) return <span className="sr-only" role="status">{message}</span>;
  return <aside className="comparison-bar" aria-label="Produtos para comparar">
    <div className="bar-heading"><strong><UiIcon name="compare" /> Comparar</strong><small>{selection.length} de 2 produtos</small><span className="sr-only" role="status">{message}</span></div>
    <div className="bar-products">{selection.map(product=><article className="bar-product" key={product.id}>
      <Link href={`/produto/${product.id}`} className="bar-photo" aria-label={`Ver ${product.name}`}><ProductImage name={product.name} url={product.imageUrl} sizes="48px" /></Link>
      <Link href={`/produto/${product.id}`} className="bar-product-name" title={product.name}>{product.name}</Link>
      <button className="bar-remove" onClick={()=>toggle(product)} aria-label={`Remover ${product.name} da comparação`} title="Remover da comparação"><UiIcon name="close" /></button>
    </article>)}{selection.length===1&&<Link href={`/catalogo?categoria=${selection[0].category}`} className="bar-product bar-empty"><span className="bar-empty-icon"><UiIcon name="add" /></span><span>Escolha o segundo<br />produto</span></Link>}</div>
    <div className="bar-actions"><button onClick={clear} className="bar-clear">Limpar</button><Link className="button primary" href={selection.length===2?`/comparar/${comparisonSlug(selected)}`:"/comparar"}>{selection.length===2?"Ver comparação":"Escolher segundo"}<UiIcon name="right" /></Link></div>
  </aside>;
}
