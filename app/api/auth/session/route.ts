import { NextRequest, NextResponse } from "next/server";
import { laravelAuth } from "@/lib/laravel-auth";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store, private" };

async function handle(request: NextRequest, method: "GET" | "POST" | "DELETE") {
  // Next may construct an internal localhost URL; browser origin must match the actual Host.
  const host = request.headers.get("host");
  const expectedOrigin = host ? new URL(`${new URL(request.nextUrl.origin).protocol}//${host}`).origin : request.nextUrl.origin;
  if (method !== "GET" && request.headers.get("origin") !== expectedOrigin) {
    return NextResponse.json({ error: "Origem inválida." }, { status: 403, headers });
  }
  try {
    let idToken: string | undefined;
    if (method === "POST") {
      const raw = await request.text();
      if (raw.length > 18000) return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers });
      let body;
      try { body = JSON.parse(raw); }
      catch { return NextResponse.json({ error: "Pedido inválido." }, { status: 400, headers }); }
      if (!body || typeof body.idToken !== "string" || !body.idToken || body.idToken.length > 16000) return NextResponse.json({ error: "Identidade inválida." }, { status: 400, headers });
      idToken = body.idToken;
    }
    const result = await laravelAuth(method, request.headers.get("cookie") ?? "", idToken);
    const response = NextResponse.json(result.body, { status: result.status, headers });
    for (const cookie of result.cookies) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch {
    return NextResponse.json({ error: "Não foi possível conectar ao backend. Tente novamente." }, { status: 503, headers });
  }
}

export const GET = (request: NextRequest) => handle(request, "GET");
export const POST = (request: NextRequest) => handle(request, "POST");
export const DELETE = (request: NextRequest) => handle(request, "DELETE");
