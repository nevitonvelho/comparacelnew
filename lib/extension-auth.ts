import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import { AdminError } from "./admin-model";
import { getStaffAccess } from "./admin-api";
import { getAdminAuth, getAdminDatabase } from "./firebase/admin";

export const extensionKeyHash = (key: string) => createHash("sha256").update(key).digest("hex");
export function extensionHeaders(request: NextRequest): Record<string,string> {
  // This dedicated API authenticates exclusively with an explicit scoped key,
  // never cookies. Origin is not a reliable extension identity (can be null).
  void request;
  return {"Access-Control-Allow-Origin":"*","Access-Control-Allow-Methods":"GET, POST, OPTIONS","Access-Control-Allow-Headers":"Authorization, Content-Type","Cache-Control":"no-store, private","X-Robots-Tag":"noindex, nofollow"};
}
export async function createExtensionKey(uid: string) {
  const key=`ccx_${randomBytes(32).toString("hex")}`;
  const expiresAt=Date.now()+30*86400000;
  await getAdminDatabase().doc(`adminExtensionKeys/${uid}`).set({hash:extensionKeyHash(key),expiresAt});
  return {key,expiresAt:new Date(expiresAt).toISOString()};
}
export async function requireExtension(request: NextRequest) {
  extensionHeaders(request);
  const key=request.headers.get("authorization")?.replace(/^Bearer /,"") ?? "";
  if(!/^ccx_[a-f0-9]{64}$/.test(key))throw new AdminError("Conecte a extensão com a chave gerada no painel.",401);
  const found=await getAdminDatabase().collection("adminExtensionKeys").where("hash","==",extensionKeyHash(key)).limit(1).get();
  const entry=found.docs[0];
  if(!entry || !Number.isFinite(Number(entry.data().expiresAt)) || Number(entry.data().expiresAt)<=Date.now())throw new AdminError("A chave expirou ou foi revogada. Gere outra no painel.",401);
  const user=await getAdminAuth().getUser(entry.id);
  if(user.disabled || !user.emailVerified || !user.providerData.some(provider=>provider.providerId==="google.com"))throw new AdminError("Conta indisponível para importar.",403);
  const actor={uid:user.uid,email:user.email,email_verified:user.emailVerified,admin:user.customClaims?.admin,firebase:{sign_in_provider:"google.com"}};
  const access=await getStaffAccess(actor);
  if(!access.permissions.includes("import.manage"))throw new AdminError("Sua conta não tem permissão para importar.",403);
  return actor;
}
