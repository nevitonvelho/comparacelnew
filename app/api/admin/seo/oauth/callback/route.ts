import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDatabase } from "@/lib/firebase/admin";
import { getStaffAccess } from "@/lib/admin-api";
import { decryptSearchSecret, encryptSearchSecret, readSearchCredentials, searchConnectionRef } from "@/lib/search-console-oauth";
import { absoluteUrl } from "@/lib/seo";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const destination = process.env.NODE_ENV === "production" ? absoluteUrl("/admin") : new URL("/admin", request.nextUrl.origin).href;
  function finish(status: string) {
    const url = new URL(destination); url.searchParams.set("secao", "seo"); url.searchParams.set("search-console", status);
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store, private"); response.headers.set("Referrer-Policy", "no-referrer");
    response.cookies.set("comparacel_search_oauth", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/admin/seo/oauth", maxAge: 0 });
    return response;
  }
  try {
    const state = request.nextUrl.searchParams.get("state") || "";
    const expected = request.cookies.get("comparacel_search_oauth")?.value || "";
    if (!state || state.length > 200 || state.length !== expected.length || !timingSafeEqual(Buffer.from(state), Buffer.from(expected))) return finish("invalid-state");
    const db = getAdminDatabase();
    const ref = db.collection("adminSeoOAuth").doc(createHash("sha256").update(state).digest("hex"));
    const pending = await db.runTransaction(async tx => {
      const data = (await tx.get(ref)).data();
      if (!data || typeof data.createdAt !== "number" || Date.now() - data.createdAt > 600000) throw new Error("expired");
      tx.delete(ref); return data;
    });
    if (request.nextUrl.searchParams.has("error")) return finish("cancelled");
    const code = request.nextUrl.searchParams.get("code");
    if (!code || code.length > 5000) return finish("failed");
    const user = await getAdminAuth().getUser(pending.uid);
    if (user.disabled || !user.providerData.some(provider => provider.providerId === "google.com")) return finish("denied");
    const access = await getStaffAccess({ uid: user.uid, email: user.email, email_verified: user.emailVerified, admin: user.customClaims?.admin, firebase: { sign_in_provider: "google.com" } });
    if (access.role !== "administrator") return finish("denied");
    const client = (await readSearchCredentials()).web;
    if (!client) return finish("configuration");
    const secret = decryptSearchSecret(pending.secret);
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret, code, code_verifier: String(secret.verifier), redirect_uri: String(secret.redirect), grant_type: "authorization_code" }), cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!tokenResponse.ok) return finish("failed");
    const token = await tokenResponse.json();
    if (typeof token.refresh_token !== "string" || typeof token.access_token !== "string") return finish("failed");
    const property = process.env.SEARCH_CONSOLE_PROPERTY || "sc-domain:comparacel.com.br";
    const sitesResponse = await fetch("https://www.googleapis.com/webmasters/v3/sites", { headers: { Authorization: `Bearer ${token.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!sitesResponse.ok) return finish("property");
    const sites = await sitesResponse.json();
    if (!sites.siteEntry?.some((site: { siteUrl: string; permissionLevel: string }) => site.siteUrl === property && site.permissionLevel !== "siteUnverifiedUser")) return finish("property");
    await searchConnectionRef().set({ encryptedTokens: encryptSearchSecret({ refreshToken: token.refresh_token }), clientId: client.client_id, property, connectedAt: new Date().toISOString(), uid: user.uid, email: user.email || "", disabled: false });
    return finish("connected");
  } catch { return finish("failed"); }
}
