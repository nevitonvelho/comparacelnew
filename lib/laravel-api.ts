import "server-only";

export class BackendError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function backendUrl(path: string) {
  const value = process.env.LARAVEL_BACKEND_URL;
  if (!value) throw new Error("Configure LARAVEL_BACKEND_URL para conectar a API Laravel.");
  const base = new URL(value);
  if (base.username || base.password || base.search || base.hash || !["http:", "https:"].includes(base.protocol)) throw new Error("Invalid Laravel backend URL");
  if (process.env.NODE_ENV === "production" && base.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(base.hostname)) throw new Error("Production backend requires HTTPS");
  return new URL(path, base);
}

export async function backendRequest<T>(action: string, body: unknown): Promise<T> {
  const token = process.env.LARAVEL_API_TOKEN;
  if (!token) throw new Error("Configure LARAVEL_API_TOKEN somente no servidor.");
  const response = await fetch(backendUrl(`/api/v1/internal/${action}`), {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new BackendError(response.status, response.status === 409 ? "Os dados foram alterados. Tente novamente." : "Não foi possível acessar os dados do Comparacel.");
  return response.json() as Promise<T>;
}
