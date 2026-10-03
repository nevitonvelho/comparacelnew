import type { User } from "firebase/auth";
import { AdminError, type AdminProduct, type AdminReference } from "@/lib/admin-model";
export type AdminCatalog = { products: AdminProduct[]; brands: AdminReference[]; stores: AdminReference[]; categories: { id: string; name: string }[] };
export type AdminDashboard = { total: number; active: number; noImage: number; noPrice: number; productViews: number; comparisonViews: number; reactions: number; offers: number; audit: { id: string; action: string; name: string; productId: string; email: string; at: string }[] };
export async function adminRequest<T>(user: User, path: string, init: RequestInit = {}): Promise<T> {
  async function send(refresh: boolean) {
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${await user.getIdToken(refresh)}`);
    if (typeof init.body === "string") headers.set("Content-Type", "application/json");
    return fetch(`/api/admin/${path}`, { ...init, headers, cache: "no-store" });
  }
  let response = await send(false);
  if (response.status === 401) response = await send(true);
  const data = await response.json().catch(() => ({ error: "Não foi possível carregar o painel." }));
  if (!response.ok) throw new AdminError(data.error ?? "Não foi possível concluir a operação.", response.status);
  return data as T;
}
export const auditLabels: Record<string, string> = { "product.create": "Produto cadastrado", "product.update": "Produto atualizado", "brands.create": "Marca cadastrada", "stores.create": "Loja cadastrada", "image.upload": "Imagem enviada" };
