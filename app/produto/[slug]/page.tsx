import { getAdminDatabase } from "@/lib/firebase/admin";
import { priceHistoryPoints } from "@/lib/price-history";
import { notFound } from "next/navigation";
import { ProductDetail } from "../../components/product-detail";
import { JsonLd } from "../../components/json-ld";
import { readServerProduct } from "@/lib/server-product";
import { breadcrumbs, pageMetadata, productDescription, productSchema } from "@/lib/seo";
import { categoryNames } from "@/lib/product-model";
type Props = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: Props) {
  const product = await readServerProduct((await params).slug);
  if (!product) notFound();
  return pageMetadata(product.metaTitle || `${product.name}: preços e ficha técnica`, productDescription(product), `/produto/${product.id}`, product.imageUrl);
}
export default async function Page({ params }: Props) {
  const { slug } = await params;
  const product = await readServerProduct(slug);
  if (!product) notFound();
  let history: ReturnType<typeof priceHistoryPoints> = [];
  let historyUnavailable = false;
  try {
    const snapshot = await getAdminDatabase().collection("priceHistory").where("productSlug", "==", slug).get();
    history = priceHistoryPoints(snapshot.docs.map(doc=>doc.data()));
  } catch { historyUnavailable = true; }
  return <><JsonLd data={productSchema(product)} /><JsonLd data={breadcrumbs([{ name: "Início", path: "/" }, { name: categoryNames[product.category] ?? "Catálogo", path: `/${product.category}` }, { name: product.name, path: `/produto/${product.id}` }])} /><ProductDetail slug={slug} product={product} history={history} historyUnavailable={historyUnavailable} /></>;
}
