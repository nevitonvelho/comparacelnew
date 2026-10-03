import { NextRequest, NextResponse } from "next/server";
import { adminHeaders, adminFailure, requireAdministrator, readAdminJson } from "@/lib/admin-api";
import { getAdminDatabase } from "@/lib/firebase/admin";
import { readAdminCatalog, saveAdminProduct } from "@/lib/admin-store";
import { invalidateServerCatalog } from "@/lib/server-catalog";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { await requireAdministrator(request); return NextResponse.json(await readAdminCatalog(getAdminDatabase()), { headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
export async function POST(request: NextRequest) {
  try { const account = await requireAdministrator(request); const product = await saveAdminProduct(getAdminDatabase(), account, await readAdminJson(request), true); invalidateServerCatalog(); return NextResponse.json({ product }, { status: 201, headers: adminHeaders }); }
  catch (error) { return adminFailure(error); }
}
