import { notFound } from "next/navigation";
import { getServerBrands } from "@/lib/server-catalog";
import { breadcrumbs, pageMetadata } from "@/lib/seo";
import { Catalog } from "../../components/catalog";
import { JsonLd } from "../../components/json-ld";
type Props = { params: Promise<{ slug: string }> };
async function getBrand(props: Props) {
  const { slug } = await props.params;
  const brand = (await getServerBrands()).find(item => item.slug === slug);
  if (!brand) notFound();
  return brand;
}
export async function generateMetadata(props: Props) {
  const brand = await getBrand(props);
  return pageMetadata(`Produtos ${brand.name}`, `Compare produtos ${brand.name}, confira fichas técnicas e encontre ofertas no Comparacel.`, `/marca/${brand.slug}`);
}
export default async function Page(props: Props) {
  const brand = await getBrand(props);
  return <main id="conteudo"><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: "Marcas", path: "/marcas" }, { name: brand.name, path: `/marca/${brand.slug}` }])} /><Catalog key={brand.slug} defaultBrand={brand.name} /></main>;
}
