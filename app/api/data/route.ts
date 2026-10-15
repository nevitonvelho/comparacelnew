import { NextRequest, NextResponse } from "next/server";
import { getAdminAuth, getAdminDatabase } from "@/lib/firebase/admin";
import { executeClientData } from "@/lib/client-data-policy";
import { AdminError } from "@/lib/admin-model";
import { readAdminJson } from "@/lib/admin-api";
import { encodeValues } from "@/lib/laravel-values";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private" };
export async function POST(request: NextRequest) {
  try {
    const origin = request.headers.get("origin");
    const host = request.headers.get("host");
    const expected = host ? `${request.nextUrl.protocol}//${host}` : request.nextUrl.origin;
    if (origin !== expected) throw new AdminError("Origem inválida.", 403);
    const bearer = request.headers.get("authorization");
    let account = null;
    if (bearer) {
      if (!bearer.startsWith("Bearer ")) throw new AdminError("Sessão inválida.", 401);
      try { account = await getAdminAuth().verifyIdToken(bearer.slice(7), true); }
      catch { throw new AdminError("Sua sessão expirou. Entre novamente.", 401); }
      if (account.email_verified !== true || account.firebase?.sign_in_provider !== "google.com") throw new AdminError("Use uma conta Google verificada.", 403);
    }
    const result = await executeClientData(getAdminDatabase(), account, await readAdminJson(request));
    return NextResponse.json(encodeValues(result), { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof AdminError ? error.message : "Dados indisponíveis. Tente novamente." }, { status: error instanceof AdminError ? error.status : 503, headers });
  }
}
