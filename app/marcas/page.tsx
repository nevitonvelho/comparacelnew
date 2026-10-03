import Link from "next/link";
import { getServerBrands } from "@/lib/server-catalog";
import { pageMetadata } from "@/lib/seo";
export const metadata = pageMetadata("Marcas", "Explore as marcas do Comparacel e compare produtos, fichas técnicas e ofertas.", "/marcas");
export default async function Page() {
  const brands = await getServerBrands();
  return <main id="conteudo"><section className="category-overview"><div className="section-heading"><h1>Explore por marca.</h1></div><div className="category-grid">{brands.map(brand => <Link href={`/marca/${brand.slug}`} key={brand.slug}><strong>{brand.name}</strong><small>Ver produtos</small></Link>)}</div></section></main>;
}
