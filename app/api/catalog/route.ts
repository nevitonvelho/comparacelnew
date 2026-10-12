import { getServerProducts } from "@/lib/server-catalog";
export const runtime = "nodejs";
export async function GET() {
  try {
    return Response.json(await getServerProducts(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Catálogo indisponível." }, { status: 503 });
  }
}
