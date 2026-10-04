"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { loadProducts } from "@/lib/products";
import { selectProduct, type Product } from "@/lib/product-model";
import { initializeAnalytics } from "@/lib/firebase/client";

import type { CategorySettings } from "@/lib/category-settings";
import { categoryNames as defaultCategoryNames } from "@/lib/product-model";
type Catalog = { categorySettings: CategorySettings; categoryNames: Record<string, string>; products: Product[]; selected: string[]; status: "loading" | "ready" | "error"; message: string; toggle: (product: Product) => void; choose: (index: number, id: string) => void; setPair: (ids: string[]) => void; clear: () => void; retry: () => void };
const Context = createContext<Catalog | null>(null);
export function CatalogProvider({ children, initialProducts = [], categorySettings = { categories: Object.entries(defaultCategoryNames).map(([id,name],order)=>({id,name,order,showOnHome:true})), homeLimit: 11 } }: { children: ReactNode; initialProducts?: Product[]; categorySettings?: CategorySettings }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [selected, setSelected] = useState<string[]>([]);
  const [status, setStatus] = useState<Catalog["status"]>(initialProducts.length ? "ready" : "loading");
  const [message, setMessage] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    const request = attempt === 0 && initialProducts.length ? Promise.resolve(initialProducts) : loadProducts();
    request.then(items => {
      if (!active) return;
      setProducts(items); setStatus("ready");
      try {
        const saved: unknown = JSON.parse(sessionStorage.getItem("comparacel-selection") ?? "[]");
        if (Array.isArray(saved)) {
          let ids: string[] = [];
          for (const id of saved) { const product = items.find(item => item.id === id); if (product) ids = selectProduct(ids, product, items).ids; }
          setSelected(ids);
        }
      } catch { /* Browser storage is optional. */ }
    }).catch(() => { if (active) setStatus("error"); });
    return () => { active = false; };
  }, [attempt, initialProducts]);
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_FIREBASE_ANALYTICS_ENABLED === "true") void initializeAnalytics().catch(() => {});
  }, []);
  function save(ids: string[]) { setSelected(ids); try { sessionStorage.setItem("comparacel-selection", JSON.stringify(ids)); } catch {} }
  function toggle(product: Product) {
    const result = selectProduct(selected, product, products);
    save(result.ids); setMessage(result.error ?? (result.ids.includes(product.id) ? "Produto adicionado à comparação." : "Produto removido da comparação."));
  }
  function choose(index: number, id: string) {
    const others = selected.filter((_, position) => position !== index);
    const product = products.find(item => item.id === id);
    if (!product) { save(others); setMessage(""); return; }
    const result = selectProduct(others, product, products);
    if (result.error) { setMessage(result.error); return; }
    save(index === 0 ? [product.id, ...others.filter(value => value !== product.id)] : result.ids);
    setMessage("Seleção atualizada.");
  }
  function setPair(ids: string[]) {
    let valid: string[] = [];
    for (const id of ids) {
      const product = products.find(item => item.id === id);
      if (!product || valid.includes(id)) continue;
      const result = selectProduct(valid, product, products);
      if (result.error) { setMessage(result.error); return; }
      valid = result.ids;
    }
    save(valid); setMessage("Seleção atualizada.");
  }
  return <Context.Provider value={{ categorySettings, categoryNames: Object.fromEntries(categorySettings.categories.map(item=>[item.id,item.name])), products, selected, status, message, toggle, choose, setPair, clear: () => { save([]); setMessage(""); }, retry: () => { setStatus("loading"); setAttempt(value => value + 1); } }}>{children}</Context.Provider>;
}
export function useCatalog() { const context = useContext(Context); if (!context) throw new Error("CatalogProvider ausente"); return context; }
