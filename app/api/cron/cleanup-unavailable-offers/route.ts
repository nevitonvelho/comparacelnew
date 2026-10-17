import { NextResponse } from "next/server";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { removeExpiredUnavailableOffers } from "@/lib/admin-unavailable-cleanup";
import { invalidateServerCatalog } from "@/lib/server-catalog";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const result = await removeExpiredUnavailableOffers(getAdminDatabase());
    if (result.removed) invalidateServerCatalog();
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Não foi possível limpar ofertas expiradas." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
