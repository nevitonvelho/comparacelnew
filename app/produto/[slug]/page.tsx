import { notFound } from "next/navigation";
import { ProductDetail } from "../../components/product-detail";
import { JsonLd } from "../../components/json-ld";
import { getServerProduct } from "@/lib/server-catalog";
import { breadcrumbs, pageMetadata, productDescription, productSchema } from "@/lib/seo";
import { categoryNames } from "@/lib/product-model";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const product = await getServerProduct((await params).slug);
  if (!product) notFound();
  return pageMetadata(`${product.name}: preços e ficha técnica`, productDescription(product), `/produto/${product.id}`, product.imageUrl);
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const product = await getServerProduct(slug);
  if (!product) notFound();
  return <><JsonLd data={productSchema(product)} /><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: categoryNames[product.category] ?? "Catálogo", path: `/${product.category}` }, { name: product.name, path: `/produto/${product.id}` }])} /><ProductDetail slug={slug} /></>;
}
