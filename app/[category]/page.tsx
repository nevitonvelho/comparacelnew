import { notFound } from "next/navigation";
import { categoryNames } from "@/lib/product-model";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { Catalog } from "../components/catalog";
import { JsonLd } from "../components/json-ld";
type Props = { params: Promise<{ category: string }> };
export async function generateMetadata({ params }: Props) {
  const { category } = await params;
  if (!Object.hasOwn(categoryNames, category)) notFound();
  return pageMetadata(categoryNames[category], `Compare ${categoryNames[category]}: fichas técnicas, recursos, preços e ofertas no Comparacel.`, `/${category}`);
}
export default async function Page({ params }: Props) {
  const { category } = await params;
  if (!Object.hasOwn(categoryNames, category)) notFound();
  return <main id="conteudo"><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: categoryNames[category], path: `/${category}` }])} /><Catalog key={category} defaultCategory={category} /></main>;
}
