import type { Product } from "./product-model";
export type { Product } from "./product-model";

export async function loadProducts(): Promise<Product[]> {
  const response = await fetch("/api/catalog", { cache: "no-store" });
  if (!response.ok) throw new Error("Não foi possível carregar o catálogo.");
  return response.json();
}
