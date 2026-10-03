"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { collection, deleteDoc, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { getDatabase } from "@/lib/firebase/client";
import { comparisonSlug } from "@/lib/product-model";
import { useAuth } from "./auth-provider";

export type LibraryKind = "likedProducts" | "likedComparisons" | "savedComparisons";
export type LibraryItem = { id: string; productIds: string[]; createdAt: number };
type Collections = Record<LibraryKind, LibraryItem[]>;
const empty: Collections = { likedProducts: [], likedComparisons: [], savedComparisons: [] };
type Library = { items: Collections; loading: boolean; error: boolean; toggle: (kind: LibraryKind, productIds: string[]) => Promise<void> };
const Context = createContext<Library | null>(null);
export function LibraryProvider({ children }: { children: ReactNode }) {
  const { user, login, loading: authLoading } = useAuth();
  const [state, setState] = useState<{ uid: string; items: Collections; ready: string[]; error: boolean } | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const uid = user.uid;
    const unsubscribes = (Object.keys(empty) as LibraryKind[]).map(kind => onSnapshot(collection(getDatabase(), "users", uid, kind), snapshot => {
      if (!active) return;
      const values = snapshot.docs.map(document => {
        const data = document.data();
        return { id: document.id, productIds: kind === "likedProducts" ? [data.productId] : data.productIds, createdAt: data.createdAt?.toMillis?.() ?? 0 } as LibraryItem;
      }).sort((a,b) => b.createdAt-a.createdAt);
      setState(current => ({ uid, items: { ...(current?.uid === uid ? current.items : empty), [kind]: values }, ready: [...new Set([...(current?.uid === uid ? current.ready : []), kind])], error: current?.uid === uid ? current.error : false }));
    }, () => { if (active) setState(current => ({ uid, items: current?.uid === uid ? current.items : empty, ready: current?.uid === uid ? current.ready : [], error: true })); }));
    return () => { active = false; unsubscribes.forEach(unsubscribe => unsubscribe()); };
  }, [user]);
  const current = user && state?.uid === user.uid ? state : null;
  async function toggle(kind: LibraryKind, productIds: string[]) {
    const account = user ?? await login();
    const ids = [...productIds].sort();
    const id = kind === "likedProducts" ? ids[0] : comparisonSlug(ids);
    const reference = doc(getDatabase(), "users", account.uid, kind, id);
    const exists = user?.uid === account.uid && current?.items[kind].some(item => item.id === id);
    if (exists) await deleteDoc(reference);
    else await setDoc(reference, { ...(kind === "likedProducts" ? { productId: ids[0] } : { productIds: ids }), createdAt: serverTimestamp() });
    window.dispatchEvent(new Event("comparacel-metrics-change"));
  }
  return <Context.Provider value={{ items: current?.items ?? empty, loading: authLoading || Boolean(user && (!current || current.ready.length < 3)), error: current?.error ?? false, toggle }}>{children}</Context.Provider>;
}
export function useLibrary() { const context = useContext(Context); if (!context) throw new Error("LibraryProvider ausente"); return context; }
