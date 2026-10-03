import { Catalog } from "../components/catalog";
import { categoryNames } from "@/lib/product-model";
export const metadata = { title: "Catálogo de produtos" };
export default async function Page({ searchParams }: { searchParams: Promise<{ categoria?: string }> }) {
  const { categoria } = await searchParams;
  return <main id="conteudo"><Catalog key={categoria ?? "todas"} defaultCategory={categoria && Object.hasOwn(categoryNames, categoria) ? categoria : "todas"} /></main>;
}
