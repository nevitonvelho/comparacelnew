import { collection, getDocs, limit, query, startAfter, where } from "firebase/firestore";
import { getDatabase } from "./firebase/client";
import type { Product } from "./product-model";
import { productFromData } from "./product-data";
export type { Product } from "./product-model";

export async function loadProducts(): Promise<Product[]> {
  const base = query(collection(getDatabase(), "products"), where("isActive", "==", true), limit(100));
  let snapshot = await getDocs(base);
  const documents = [...snapshot.docs];
  while (snapshot.size === 100) {
    snapshot = await getDocs(query(base, startAfter(snapshot.docs[snapshot.docs.length - 1])));
    documents.push(...snapshot.docs);
  }
  return documents.map(document => productFromData(document.id, document.data())).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
