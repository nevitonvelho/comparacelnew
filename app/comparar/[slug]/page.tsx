import { notFound, permanentRedirect } from "next/navigation";
import { Comparison } from "../../components/comparison";
import { JsonLd } from "../../components/json-ld";
import { getComparisonPair } from "@/lib/server-catalog";
import { absoluteUrl, breadcrumbs, pageMetadata } from "@/lib/seo";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const pair = await getComparisonPair((await params).slug);
  if (!pair) notFound();
  return pageMetadata(`${pair.a.name} vs ${pair.b.name}`, `Compare ${pair.a.name} e ${pair.b.name}: diferenças na ficha técnica, recursos e ofertas para ajudar na sua escolha.`, `/comparar/${pair.slug}`, pair.a.imageUrl);
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const pair = await getComparisonPair(slug);
  if (!pair) notFound();
  if (slug !== pair.slug) permanentRedirect(`/comparar/${pair.slug}`);
  return <><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: "Comparar produtos", path: "/comparar" }, { name: `${pair.a.name} vs ${pair.b.name}`, path: `/comparar/${pair.slug}` }])} /><JsonLd data={{ "@context": "https://schema.org", "@type": "ItemList", name: `${pair.a.name} vs ${pair.b.name}`, itemListElement: [pair.a, pair.b].map((product, index) => ({ "@type": "ListItem", position: index + 1, name: product.name, url: absoluteUrl(`/produto/${product.id}`) })) }} /><Comparison slug={pair.slug} /></>;
}
