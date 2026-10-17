import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminFailure, adminHeaders, requireAdministrator } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { AdminError } from "@/lib/admin-model";
import { readSearchCredentials, encryptSearchSecret, searchConnectionRef } from "@/lib/search-console-oauth";
import { absoluteUrl } from "@/lib/seo";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const actor = await requireAdministrator(request, "users.manage");
    const credentials = await readSearchCredentials();
    if (!credentials.web?.client_id || !credentials.web.client_secret) throw new AdminError("O cliente OAuth atual não é Aplicativo da Web. Cadastre esse tipo de cliente no Google Cloud com o retorno https://comparacel.com.br/api/admin/seo/oauth/callback.", 503);
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(48).toString("base64url");
    const redirect = process.env.NODE_ENV === "production" ? absoluteUrl("/api/admin/seo/oauth/callback") : new URL("/api/admin/seo/oauth/callback", request.nextUrl.origin).href;
    const ref = getAdminDatabase().collection("adminSeoOAuth").doc(createHash("sha256").update(state).digest("hex"));
    await ref.set({ uid: actor.uid, createdAt: Date.now(), secret: encryptSearchSecret({ verifier, redirect }) });
    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.search = new URLSearchParams({ client_id: credentials.web.client_id, redirect_uri: redirect, response_type: "code", scope: "https://www.googleapis.com/auth/webmasters.readonly", access_type: "offline", prompt: "consent", state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256" }).toString();
    const response = NextResponse.json({ url: url.href }, { headers: adminHeaders });
    response.cookies.set("comparacel_search_oauth", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/api/admin/seo/oauth", maxAge: 600 });
    return response;
  } catch (error) { return adminFailure(error); }
}
export async function DELETE(request: NextRequest) {
  try {
    await requireAdministrator(request, "users.manage");
    await searchConnectionRef().set({ disabled: true });
    return NextResponse.json({ disconnected: true }, { headers: adminHeaders });
  } catch (error) { return adminFailure(error); }
}
