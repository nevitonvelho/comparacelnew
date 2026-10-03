import { Catalog } from "../components/catalog";
import { categoryNames } from "@/lib/product-model";
import { pageMetadata } from "@/lib/seo";
type Props = { searchParams: Promise<{ categoria?: string; q?: string }> };
export async function generateMetadata({ searchParams }: Props) {
  const { categoria, q } = await searchParams;
  const name = categoria && categoryNames[categoria];
  return { ...pageMetadata(name || "Catálogo de produtos", name ? `Compare ${name}: fichas técnicas, preços e ofertas no Comparacel.` : "Explore celulares, notebooks, TVs e eletrodomésticos. Compare fichas técnicas e ofertas no Comparacel.", name ? `/${categoria}` : "/catalogo"), ...(q ? { robots: { index: false, follow: true } } : {}) };
}
export default async function Page({ searchParams }: Props) {
  const { categoria, q } = await searchParams;
  return <main id="conteudo"><Catalog key={`${categoria ?? "todas"}:${q ?? ""}`} defaultCategory={categoria && Object.hasOwn(categoryNames, categoria) ? categoria : "todas"} defaultSearch={q ?? ""} /></main>;
}
