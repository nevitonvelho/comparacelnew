import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { getAdminDatabase } from "./firebase/admin";
import { permissionLabels, type Permission, type StaffAccess } from "./admin-permissions";
import { getAdminAuth } from "./firebase/admin";
import { AdminError, isAdministrator } from "./admin-model";
export const adminHeaders = { "Cache-Control": "no-store, private", "X-Robots-Tag": "noindex, nofollow" };
export async function requireAdministrator(request: NextRequest, permission?: Permission | "users.manage") {
  const origin = request.headers.get("origin");
  if ((!["GET", "HEAD"].includes(request.method) || origin) && origin !== request.nextUrl.origin) throw new AdminError("Origem inválida.", 403);
  const bearer = request.headers.get("authorization");
  if (!bearer?.startsWith("Bearer ")) throw new AdminError("Entre com Google para acessar o painel.", 401);
  let account;
  try { account = await getAdminAuth().verifyIdToken(bearer.slice(7), true); }
  catch { throw new AdminError("Sua sessão expirou. Entre novamente.", 401); }
  const access = await getStaffAccess(account);
  if (access.role === "user" || permission === "users.manage" && access.role !== "administrator" || permission && permission !== "users.manage" && !access.permissions.includes(permission)) throw new AdminError("Sua conta não tem permissão para este módulo.", 403);
  return { ...account, access };
}
export async function getStaffAccess(account: Parameters<typeof isAdministrator>[0]): Promise<StaffAccess> {
  if (isAdministrator(account, process.env.ADMIN_EMAILS ?? "")) return {role:"administrator",owner:true,permissions:Object.keys(permissionLabels) as Permission[]};
  if (account.email_verified !== true || account.firebase?.sign_in_provider !== "google.com") return {role:"user",owner:false,permissions:[]};
  const data=(await getAdminDatabase().doc(`adminUserAccess/${account.uid}`).get()).data();
  if(data?.role === "administrator") return {role:"administrator",owner:false,permissions:Object.keys(permissionLabels) as Permission[]};
  const permissions: Permission[] = data?.role === "employee" && Array.isArray(data.permissions) ? data.permissions.filter((value: unknown): value is Permission => typeof value === "string" && Object.hasOwn(permissionLabels,value)) : [];
  return {role:permissions.length ? "employee":"user",owner:false,permissions};
}
export async function readAdminBytes(request: NextRequest, maximum = 400000) {
  if (Number(request.headers.get("content-length") ?? 0) > maximum) throw new AdminError("Arquivo ou formulário muito grande.", 413);
  if (!request.body) throw new AdminError("Pedido vazio.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > maximum) { await reader.cancel(); throw new AdminError("Arquivo ou formulário muito grande.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
export async function readAdminJson(request: NextRequest) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AdminError("Formato inválido.");
  try { return JSON.parse((await readAdminBytes(request)).toString("utf8")); }
  catch (error) { if (error instanceof AdminError) throw error; throw new AdminError("JSON inválido."); }
}
export function adminFailure(error: unknown) {
  if (error instanceof AdminError) return NextResponse.json({ error: error.message }, { status: error.status, headers: adminHeaders });
  console.error("Falha no painel administrativo", error instanceof Error ? error.message : "erro desconhecido");
  return NextResponse.json({ error: "Não foi possível concluir a operação. Tente novamente." }, { status: 503, headers: adminHeaders });
}
