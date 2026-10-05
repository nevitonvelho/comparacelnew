import type { User } from "firebase/auth";
import { AdminError, type AdminProduct, type AdminReference } from "@/lib/admin-model";
export type AdminCatalog = { products: AdminProduct[]; brands: AdminReference[]; stores: AdminReference[]; homeLimit: number; categories: { id: string; name: string; showOnHome: boolean; order: number }[] };
export type AdminDashboard = { users: number | null; total: number; active: number; noImage: number; noPrice: number; productViews: number; comparisonViews: number; reactions: number; offers: number; audit: { id: string; action: string; name: string; productId: string; email: string; at: string }[] };
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
  if (!response.ok) {
    const error=new AdminError(data.error ?? "Não foi possível concluir a operação.", response.status);
    if(typeof data.retryAfterMs==="number")error.retryAfterMs=data.retryAfterMs;
    throw error;
  }
  return data as T;
}
export const auditLabels: Record<string, string> = { "product.price": "Preço atualizado", "product.status": "Situação do produto alterada", "users.access": "Acesso de usuário atualizado", "category-created": "Categoria cadastrada", "categories-home-updated": "Categorias da home atualizadas", "product.import": "Produto importado", "product.delete": "Produto excluído", "product.create": "Produto cadastrado", "product.update": "Produto atualizado", "brands.create": "Marca cadastrada", "stores.create": "Loja cadastrada", "image.upload": "Imagem enviada" };
