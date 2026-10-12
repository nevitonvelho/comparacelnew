import { notFound } from "next/navigation";
import { getServerCategorySettings } from "@/lib/server-public-data";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { Catalog } from "../components/catalog";
import { JsonLd } from "../components/json-ld";
// Generate and cache each URL on its first request, including new products.
export async function generateStaticParams() { return []; }
export const revalidate = 1800;
type Props = { params: Promise<{ category: string }> };
export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  const categoryNames = Object.fromEntries((await getServerCategorySettings()).categories.map(item=>[item.id,item.name]));
  if (!Object.hasOwn(categoryNames, category)) notFound();
  return pageMetadata(categoryNames[category], `Compare ${categoryNames[category]}: fichas técnicas, recursos, preços e ofertas no Comparacel.`, `/${category}`);
}
export default async function Page({ params }: Props) {
  const { category } = await params;
  const categoryNames = Object.fromEntries((await getServerCategorySettings()).categories.map(item=>[item.id,item.name]));
  if (!Object.hasOwn(categoryNames, category)) notFound();
  return <main id="conteudo"><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: categoryNames[category], path: `/${category}` }])} /><Catalog key={category} defaultCategory={category} /></main>;
}
